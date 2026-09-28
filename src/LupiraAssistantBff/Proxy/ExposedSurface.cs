using System.Text.Json;
using System.Text.Json.Serialization;

namespace LupiraAssistantBff.Proxy;

/// <summary>
/// Every <c>VERB /path</c> the BFF forwards. A positive list, so an endpoint an upstream grows later
/// stays invisible until someone adds a line.
/// </summary>
internal sealed class ExposedSurface
{
    /// <summary>Where each upstream is mounted on the BFF.</summary>
    public static readonly IReadOnlyDictionary<string, string> ClusterPrefixes = new Dictionary<string, string>
    {
        ["assistant-api"] = "/api",
        ["comms-api"] = "/comms-api",
        ["location-api"] = "/location-api",
        ["health-api"] = "/health-api",
    };

    [JsonPropertyName("operations")]
    public Dictionary<string, List<string>> Operations { get; init; } = [];

    /// <summary>Browser legs an upstream authenticates itself (the hub's hosted enrollment).</summary>
    [JsonPropertyName("anonymous")]
    public Dictionary<string, List<string>> Anonymous { get; init; } = [];

    /// <summary>Device-credential surfaces: routed, but never part of the client's contract.</summary>
    [JsonPropertyName("device")]
    public Dictionary<string, List<string>> Device { get; init; } = [];

    public static ExposedSurface Load()
    {
        using var stream = typeof(ExposedSurface).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource {ResourceName} is missing.");
        return JsonSerializer.Deserialize<ExposedSurface>(stream)
            ?? throw new InvalidOperationException($"{ResourceName} did not deserialize.");
    }

    private const string ResourceName = "LupiraAssistantBff.exposed.json";
}
