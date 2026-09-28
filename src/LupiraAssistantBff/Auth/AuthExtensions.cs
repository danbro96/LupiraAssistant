using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace LupiraAssistantBff.Auth;

/// <summary>
/// SSO gate for the proxied member surface. The mobile app presents an Authentik-minted JWT bearer that
/// is validated here and forwarded verbatim upstream (the upstreams validate it again themselves).
/// Non-production auto-authenticates a local user via <see cref="DevAuthHandler"/> so the stack runs
/// without Authentik. A browser-facing cookie/OIDC scheme lands with the SPA — until then bearer is the
/// only production front door.
/// </summary>
internal static class AuthExtensions
{
    public static void AddAssistantWebAuth(this WebApplicationBuilder builder)
    {
        var services = builder.Services;
        services.AddHttpContextAccessor();

        AuthenticationBuilder auth;
        string? interactiveScheme = null;
        if (builder.Environment.IsProduction())
        {
            auth = services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme);
        }
        else
        {
            auth = services.AddAuthentication(DevAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, DevAuthHandler>(DevAuthHandler.SchemeName, null);
            interactiveScheme = DevAuthHandler.SchemeName;
        }

        // DefaultPolicy = authenticated via a bearer (or the dev scheme) — referenced by the YARP
        // routes ("Default"). The bearer scheme is added only when an authority is configured.
        var hasBearer = AddBearer(builder, auth);
        var schemes = (hasBearer, interactiveScheme) switch
        {
            (true, null) => [JwtBearerDefaults.AuthenticationScheme],
            (true, not null) => new[] { interactiveScheme, JwtBearerDefaults.AuthenticationScheme },
            (false, not null) => [interactiveScheme],
            _ => throw new InvalidOperationException("Production requires Auth:Bearer:Authority (or Auth:Oidc:Authority)."),
        };
        services.AddAuthorizationBuilder().SetDefaultPolicy(
            new AuthorizationPolicyBuilder(schemes).RequireAuthenticatedUser().Build());
    }

    /// <summary>JWT bearer for the mobile app's Authentik public client (<c>lupira-assistant</c>). The
    /// token's audience must include this backend's — the same token satisfies the BFF and every proxied
    /// upstream.</summary>
    private static bool AddBearer(WebApplicationBuilder builder, AuthenticationBuilder auth)
    {
        var authority = builder.Configuration["Auth:Bearer:Authority"] ?? builder.Configuration["Auth:Oidc:Authority"];
        if (string.IsNullOrWhiteSpace(authority)) return false;   // bare dev config — interactive scheme only
        var audience = builder.Configuration["Auth:Bearer:Audience"] ?? "lupira-assistant";

        auth.AddJwtBearer(o =>
        {
            o.Authority = authority;
            o.MapInboundClaims = false;
            o.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
            o.TokenValidationParameters.ValidAudience = audience;
            o.TokenValidationParameters.NameClaimType = "email";
            o.TokenValidationParameters.RoleClaimType = "groups";
        });
        return true;
    }
}
