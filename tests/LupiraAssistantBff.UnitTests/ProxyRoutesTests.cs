using Lupira.Bff.Proxy;
using Xunit;

namespace LupiraAssistantBff.UnitTests;

public class ProxyRoutesTests
{
    private static readonly IReadOnlyList<ProxyRoute> Routes =
        ProxyRoutes.Plan(ExposedSurface.Load(typeof(Program).Assembly));

    [Fact]
    public void No_route_is_a_wildcard()
    {
        // A catch-all forwards whatever the upstream adds under it, unreviewed.
        Assert.DoesNotContain(Routes, r => r.Path.Contains("**", StringComparison.Ordinal));
    }

    [Fact]
    public void Only_the_enrollment_legs_and_device_ingest_are_anonymous()
    {
        var anonymous = Routes
            .Where(r => r.Group.Policy == "Anonymous")
            .Select(r => r.Path)
            .Distinct()
            .Order(StringComparer.Ordinal)
            .ToList();

        Assert.Equal(
            ["/api/auth/callback", "/api/auth/done", "/api/auth/login",
             "/ingest/location", "/ingest/location/cursor", "/ingest/location/state",
             "/ingest/ring", "/ingest/summaries"],
            anonymous);
    }

    [Fact]
    public void Prefixed_routes_strip_their_prefix_and_only_assistant_api_announces_it()
    {
        foreach (var route in Routes.Where(r => r.Group.Credential != UpstreamCredential.DeviceKey))
        {
            Assert.NotNull(route.RemovePrefix);
            Assert.StartsWith(route.RemovePrefix + "/", route.Path, StringComparison.Ordinal);
            Assert.Equal(route.Cluster == "assistant-api", route.AnnouncesPrefix);
        }
    }

    [Fact]
    public void Device_ingest_is_untransformed_and_unprefixed()
    {
        var device = Routes.Where(r => r.Group.Credential == UpstreamCredential.DeviceKey).ToList();

        Assert.NotEmpty(device);
        Assert.All(device, route =>
        {
            Assert.Null(route.RemovePrefix);
            Assert.StartsWith("/ingest/", route.Path, StringComparison.Ordinal);
        });
    }
}
