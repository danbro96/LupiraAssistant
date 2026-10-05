using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Text;
using Xunit;

namespace LupiraAssistantBff.IntegrationTests;

/// <summary>
/// Hosts the BFF in the Production wiring (bearer-only, the shipped policy) with the YARP clusters pointed
/// at an in-process stub upstream. The bearer scheme is re-keyed to a local symmetric signing key so tests
/// mint their own tokens.
/// </summary>
public sealed class BffTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Issuer = "https://auth.test/";
    public const string Audience = "lupira-assistant";
    private static readonly SymmetricSecurityKey SigningKey =
        new(Encoding.UTF8.GetBytes("lupira-assistant-web-integration-test-signing-key-0123456789"));

    public StubUpstream Upstream { get; private set; } = null!;

    public async Task InitializeAsync() => Upstream = await StubUpstream.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await Upstream.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        // UseSetting, not ConfigureAppConfiguration: with minimal hosting the factory's config sources are
        // appended at Build(), AFTER Program.cs top-level code has already read values — settings injected
        // this way are visible from the first line.
        foreach (var cluster in new[] { "assistant-api", "comms-api", "health-api" })
            builder.UseSetting($"ReverseProxy:Clusters:{cluster}:Destinations:primary:Address", Upstream.Address);
        builder.UseSetting("Auth:Bearer:Authority", Issuer);
        builder.UseSetting("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:9");
        builder.ConfigureTestServices(services =>
        {
            // Local signing key instead of Authentik discovery.
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, o =>
            {
                o.Authority = null;
                o.ConfigurationManager = null;
                o.RequireHttpsMetadata = false;
                o.TokenValidationParameters.ValidIssuer = Issuer;
                o.TokenValidationParameters.ValidAudience = Audience;
                o.TokenValidationParameters.IssuerSigningKey = SigningKey;
            });
        });
    }

    /// <summary>Mint a bearer the re-keyed scheme accepts. Pass a wrong audience/issuer to make it rejectable.</summary>
    public static string MintToken(string email = "user@test", string audience = Audience, string issuer = Issuer)
    {
        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Expires = DateTime.UtcNow.AddMinutes(10),
            Subject = new ClaimsIdentity([new Claim("email", email), new Claim("sub", $"test|{email}")]),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256),
        });
    }
}
