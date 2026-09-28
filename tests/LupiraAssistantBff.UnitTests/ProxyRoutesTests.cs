using LupiraAssistantBff.Proxy;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LupiraAssistantBff.UnitTests;

/// <summary>
/// The route table is computed from <c>exposed.json</c> at startup: the keys must be shaped the way
/// YARP's <c>LoadFromConfig</c> and the <c>ApiPrefixes</c> fence read them.
/// </summary>
public class ProxyRoutesTests
{
    private static readonly ExposedSurface Exposed = ExposedSurface.Load();

    /// <summary>Reads the generated keys back exactly as the app does.</summary>
    private static IConfigurationSection Routes() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(ProxyRoutes.Build(Exposed))
            .Build()
            .GetSection("ReverseProxy:Routes");

    [Fact]
    public void Every_allowlisted_operation_is_routed_exactly_once()
    {
        var routed = Routes().GetChildren()
            .SelectMany(route => route.GetSection("Match:Methods").GetChildren()
                .Select(m => $"{m.Value} {route["Match:Path"]}"))
            .ToList();

        var declared = Exposed.Operations.Concat(Exposed.Anonymous)
            .SelectMany(g => g.Value.Select(op => Prefixed(g.Key, op)))
            // Device ingest keeps the upstream's own path: no prefix, so nothing to prepend.
            .Concat(Exposed.Device.SelectMany(g => g.Value))
            .ToList();

        Assert.Equal(declared.Count, routed.Count);
        Assert.Empty(declared.Except(routed, StringComparer.Ordinal));
    }

    [Fact]
    public void No_route_is_a_wildcard()
    {
        // A catch-all forwards whatever the upstream adds under it, unreviewed.
        Assert.DoesNotContain(Routes().GetChildren(), r => r["Match:Path"]!.Contains("**", StringComparison.Ordinal));
    }

    [Fact]
    public void Only_the_enrollment_legs_and_device_ingest_are_anonymous()
    {
        var anonymous = Routes().GetChildren()
            .Where(r => r["AuthorizationPolicy"] == "Anonymous")
            .Select(r => r["Match:Path"]!)
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
        foreach (var route in Routes().GetChildren())
        {
            var path = route["Match:Path"]!;
            if (path.StartsWith("/ingest/", StringComparison.Ordinal)) continue;

            var cluster = route["ClusterId"]!;
            var prefix = ExposedSurface.ClusterPrefixes[cluster];
            Assert.StartsWith(prefix + "/", path, StringComparison.Ordinal);
            Assert.Equal(prefix, route["Transforms:0:PathRemovePrefix"]);
            Assert.Equal(cluster == "assistant-api" ? prefix : null, route["Transforms:2:Set"]);
        }
    }

    [Fact]
    public void Device_ingest_is_untransformed_and_unprefixed()
    {
        var device = Routes().GetChildren().Where(r => r["Match:Path"]!.StartsWith("/ingest/", StringComparison.Ordinal)).ToList();

        Assert.Equal(Exposed.Device.Sum(d => d.Value.Count), device.Count);
        Assert.All(device, r => Assert.Null(r["Transforms:0:PathRemovePrefix"]));
    }

    private static string Prefixed(string cluster, string operation)
    {
        var parts = operation.Split(' ', 2);
        return $"{parts[0]} {ExposedSurface.ClusterPrefixes[cluster]}{parts[1]}";
    }
}
