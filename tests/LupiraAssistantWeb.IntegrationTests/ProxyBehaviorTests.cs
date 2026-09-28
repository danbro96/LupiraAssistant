using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Xunit;

namespace LupiraAssistantWeb.IntegrationTests;

public sealed class ProxyBehaviorTests(BffTestFactory factory) : IClassFixture<BffTestFactory>
{
    private const string DeviceKey = "DeviceKey 0123456789abcdef0123456789abcdef.0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private HttpClient Client() => factory.CreateClient();

    private HttpClient MemberClient()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = Bearer(BffTestFactory.MintToken());
        return client;
    }

    private static AuthenticationHeaderValue Bearer(string token) => new("Bearer", token);

    [Fact]
    public async Task Member_route_without_token_is_401()
    {
        var res = await Client().GetAsync("/api/me/profile");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Member_route_with_wrong_audience_is_401()
    {
        var client = Client();
        client.DefaultRequestHeaders.Authorization = Bearer(BffTestFactory.MintToken(audience: "some-other-api"));
        var res = await client.GetAsync("/api/me/profile");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Assistant_route_strips_prefix_and_forwards_bearer_verbatim()
    {
        var token = BffTestFactory.MintToken();
        var client = Client();
        client.DefaultRequestHeaders.Authorization = Bearer(token);

        var echo = await client.GetFromJsonAsync<UpstreamEcho>("/api/me/profile");

        Assert.NotNull(echo);
        Assert.Equal("/me/profile", echo.Path);
        Assert.Equal($"Bearer {token}", echo.Authorization);
        Assert.Equal("/api", echo.XForwardedPrefix);
        Assert.Equal("", echo.XDevUser);   // production never invents a dev identity
    }

    [Theory]
    [InlineData("/comms-api/topics?status=released", "/topics")]
    [InlineData("/location-api/devices", "/devices")]
    [InlineData("/health-api/me", "/me")]
    public async Task Upstream_route_strips_its_own_prefix_without_announcing_it(string url, string upstreamPath)
    {
        var echo = await MemberClient().GetFromJsonAsync<UpstreamEcho>(url);

        Assert.NotNull(echo);
        Assert.Equal(upstreamPath, echo.Path);
        Assert.Equal("", echo.XForwardedPrefix);
    }

    [Fact]
    public async Task Auth_route_is_anonymous_and_carries_the_prefix()
    {
        var echo = await Client().GetFromJsonAsync<UpstreamEcho>("/api/auth/login?return_uri=x");

        Assert.NotNull(echo);
        Assert.Equal("/auth/login", echo.Path);
        Assert.Equal("/api", echo.XForwardedPrefix);
        Assert.Equal("", echo.Authorization);
    }

    [Theory]
    [InlineData("/api/admin/secrets")]
    [InlineData("/location-api/location/track")]
    [InlineData("/health-api/health/ring")]
    public async Task Unlisted_path_under_a_prefix_is_404_even_when_signed_in(string url)
    {
        var res = await MemberClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Listed_path_with_an_unlisted_verb_is_not_proxied()
    {
        var res = await MemberClient().DeleteAsync("/api/me/profile");
        Assert.NotEqual(HttpStatusCode.OK, res.StatusCode);
    }

    [Theory]
    [InlineData("/ingest/location")]
    [InlineData("/ingest/ring")]
    [InlineData("/ingest/summaries")]
    public async Task Device_ingest_forwards_a_well_formed_key_untouched(string path)
    {
        var client = Client();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", DeviceKey);

        var res = await client.PostAsync(path, new StringContent("{}\n", null, "application/x-ndjson"));
        var echo = await res.Content.ReadFromJsonAsync<UpstreamEcho>();

        Assert.NotNull(echo);
        Assert.Equal(path, echo.Path);
        Assert.Equal(DeviceKey, echo.Authorization);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("DeviceKey not-a-key")]
    [InlineData("Bearer abc")]
    public async Task Device_ingest_rejects_a_missing_or_malformed_key(string? authorization)
    {
        var client = Client();
        if (authorization is not null) client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", authorization);

        var res = await client.PostAsync("/ingest/location", new StringContent("{}\n"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
