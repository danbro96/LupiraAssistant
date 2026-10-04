using Lupira.Bff.Auth;
using Lupira.Bff.Proxy;
using Lupira.Hosting.Defaults;
using Lupira.Hosting.Health;
using Lupira.Hosting.Observability;

var builder = WebApplication.CreateBuilder(args);

if (builder.TryPrintLupiraBffRoutes(args)) return;

builder.AddLupiraDefaults(o =>
{
    o.StrictNumbers = false;
    o.CaseInsensitiveProperties = true;
    o.StatusCodePages = false;
});

builder.AddLupiraBffProxy();
builder.AddLupiraBffAuth(o =>
{
    o.EnableBearer = true;
    o.Audience = "lupira-assistant";
});

builder.Services.AddLupiraHealth();

builder.AddLupiraTelemetry("lupira-assistant-web");

var app = builder.Build();

app.UseLupiraDefaults();

if (app.Environment.IsProduction())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.MapLupiraHealth();

app.UseLupiraBffDeviceKeyGate();
app.UseAuthentication();
app.UseAuthorization();

app.MapLupiraBffProxy();

app.Run();

// Exposes the implicit Program entry point to the integration test assembly (WebApplicationFactory<Program>).
public partial class Program;
