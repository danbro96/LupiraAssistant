using LupiraAssistantWeb.Auth;
using LupiraAssistantWeb.Endpoints;
using LupiraAssistantWeb.Proxy;
using Microsoft.AspNetCore.HttpOverrides;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

// `--routes` prints what the proxy will serve.
if (args is ["--routes", ..])
{
    foreach (var (key, value) in ProxyRoutes.Build(ExposedSurface.Load()).OrderBy(r => r.Key, StringComparer.Ordinal))
        Console.WriteLine($"{key} = {value}");
    return;
}

// One exact template per allowlisted path, as a config source: YARP's LoadFromConfig and the
// ApiPrefixes fence then read it exactly as they read appsettings, and clusters stay hand-maintained.
builder.Configuration.AddInMemoryCollection(ProxyRoutes.Build(ExposedSurface.Load()));

// Prod: the mobile app's Authentik JWT bearer. Dev: a local user, forwarded upstream as X-Dev-User.
builder.AddAssistantWebAuth();

builder.Services.AddAppHealthChecks();

// Reverse proxy to the upstream APIs (REST at the upstream root, so the prefix is stripped; the
// assistant routes re-announce it via X-Forwarded-Prefix so the hub's OIDC enrollment builds proxied
// callback URLs). A caller-presented bearer is forwarded verbatim — YARP copies the Authorization
// header, so the transform stands aside; the upstreams validate the token themselves. Dev forwards
// X-Dev-User instead of a token so the stack runs without Authentik.
var isDev = builder.Environment.IsDevelopment();
var devUser = builder.Configuration["Dev:User"] ?? "dev@localhost";
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(ctx => ctx.AddRequestTransform(transform =>
    {
        var incoming = transform.HttpContext.Request.Headers.Authorization.ToString();
        if (!isDev
            || incoming.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            || incoming.StartsWith(DeviceKeyHeader.Scheme, StringComparison.Ordinal))
            return ValueTask.CompletedTask;

        // Replace, never append: StringValues joins duplicates with a comma and the upstream's dev
        // handler derives its principal from the value, so a caller-supplied header would otherwise
        // change who the request runs as.
        transform.ProxyRequest.Headers.Remove("X-Dev-User");
        transform.ProxyRequest.Headers.TryAddWithoutValidation("X-Dev-User", devUser);
        return ValueTask.CompletedTask;
    }));

// OpenTelemetry → platform collector. Env-gated: a no-op without OTEL_EXPORTER_OTLP_ENDPOINT (local
// dev stays silent). Protocol/headers/interval/resource-attrs come from the standard OTEL_* env vars.
var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
if (!string.IsNullOrWhiteSpace(otlpEndpoint))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService(
            serviceName: "lupira-assistant-web",
            serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0"))
        .WithTracing(t => t
            .AddAspNetCoreInstrumentation(o =>
            {
                o.RecordException = true;
                // Health probes are polled constantly by docker + devops-monitor; their spans add nothing.
                o.Filter = ctx => ctx.Request.Path != "/livez" && ctx.Request.Path != "/readyz";
            })
            .AddHttpClientInstrumentation()
            .AddOtlpExporter())
        .WithMetrics(m => m
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation()
            .AddOtlpExporter());

    builder.Logging.AddOpenTelemetry(o =>
    {
        o.IncludeFormattedMessage = true;
        o.IncludeScopes = true;
        o.AddOtlpExporter();
    });
}

var app = builder.Build();

// Behind the reverse tunnel: trust X-Forwarded-* so redirects and Secure cookies use https. The tunnel
// reaches us from a Docker-bridge IP, not loopback, so the default KnownProxies/KnownNetworks allowlist
// would drop the headers — clear it. Safe only because the container's sole ingress is the tunnel.
var forwardedHeaders = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedHeaders.KnownIPNetworks.Clear();
forwardedHeaders.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaders);

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.MapAppHealthChecks();

// The ingest routes are Anonymous because the device key is only checkable by the upstream, which
// holds the keys. Reject a missing or malformed header here so the route is not a blank relay.
app.UseWhen(
    ctx => ctx.Request.Path.StartsWithSegments("/ingest", StringComparison.OrdinalIgnoreCase),
    branch => branch.Use(async (ctx, next) =>
    {
        if (!DeviceKeyHeader.IsWellFormed(ctx.Request.Headers.Authorization))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        await next();
    }));

app.UseAuthentication();
app.UseAuthorization();

app.MapReverseProxy();

// A proxied prefix that matched no route is a 404 whatever the caller's credentials, so a removed
// route and an unlisted one look alike from outside. Literal segments outrank this catch-all.
foreach (var prefix in ApiPrefixes(app.Configuration))
    app.Map($"{prefix}/{{**rest}}", () => Results.NotFound());

app.Run();

// The first segment of every proxy route's path, so the fence can't drift from the route table.
static string[] ApiPrefixes(IConfiguration config) =>
    config.GetSection("ReverseProxy:Routes").GetChildren()
        .Select(route => route["Match:Path"])
        .Where(path => !string.IsNullOrWhiteSpace(path))
        .Select(path => $"/{path!.TrimStart('/').Split('/')[0]}")
        .Distinct()
        .ToArray();

// Exposes the implicit Program entry point to the integration test assembly (WebApplicationFactory<Program>).
public partial class Program;
