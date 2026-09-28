using System.Globalization;
using System.Text.RegularExpressions;

namespace LupiraAssistantWeb.Proxy;

/// <summary>
/// Builds <c>ReverseProxy:Routes</c> from <c>exposed.json</c> — one exact template per path, methods
/// pinned — as a configuration source.
/// </summary>
/// <remarks>
/// Fed to <c>AddInMemoryCollection</c> so YARP's <c>LoadFromConfig</c> and the <c>ApiPrefixes</c> fence
/// read it as they read appsettings. A config source rather than <c>LoadFromMemory</c> because that
/// takes the clusters with it, and those are hand-maintained.
/// </remarks>
internal static partial class ProxyRoutes
{
    private const string DefaultPolicy = "Default";
    private const string AnonymousPolicy = "Anonymous";

    /// <summary>
    /// Upstreams told where they are mounted: assistant-api consumes <c>X-Forwarded-Prefix</c> into its
    /// PathBase so the hosted enrollment builds callback URLs (and cookie paths) that route back here.
    /// </summary>
    private static readonly HashSet<string> AnnouncesPrefix = new(StringComparer.Ordinal) { "assistant-api" };

    public static IEnumerable<KeyValuePair<string, string?>> Build(ExposedSurface exposed)
    {
        var settings = new Dictionary<string, string?>(StringComparer.Ordinal);
        var seen = new Dictionary<string, string>(StringComparer.Ordinal);

        WritePrefixed(settings, seen, exposed.Operations, DefaultPolicy);

        // The hub's enrollment legs arrive from a browser with no bearer; assistant-api challenges into
        // Authentik itself.
        WritePrefixed(settings, seen, exposed.Anonymous, AnonymousPolicy);

        // Device ingest: mounted at the upstream's own path, so no prefix and no transform, and
        // Anonymous because the credential is a per-device key only the upstream can validate. The BFF
        // rejects malformed headers (DeviceKeyHeader) and the transform stands aside.
        foreach (var (cluster, entries) in exposed.Device.OrderBy(d => d.Key, StringComparer.Ordinal))
        {
            foreach (var entry in entries)
            {
                var (verb, path) = Split(entry);
                var key = Claim(seen, Key(cluster + path + "-" + verb), $"{verb} {path}");
                Write(settings, key, cluster, AnonymousPolicy, path, [verb], removePrefix: null);
            }
        }

        return settings;
    }

    private static void WritePrefixed(
        Dictionary<string, string?> settings,
        Dictionary<string, string> seen,
        Dictionary<string, List<string>> surface,
        string policy)
    {
        foreach (var (cluster, operations) in surface.OrderBy(o => o.Key, StringComparer.Ordinal))
        {
            var prefix = Prefix(cluster);
            var byPath = new SortedDictionary<string, SortedSet<string>>(StringComparer.Ordinal);
            foreach (var operation in operations)
            {
                var (verb, path) = Split(operation);
                if (!byPath.TryGetValue(path, out var verbs)) byPath[path] = verbs = new(StringComparer.Ordinal);
                verbs.Add(verb);
            }

            foreach (var (path, verbs) in byPath)
            {
                var raw = $"{cluster}{path}".Replace("{", string.Empty, StringComparison.Ordinal)
                    .Replace("}", string.Empty, StringComparison.Ordinal);
                var key = Claim(seen, Key(policy == AnonymousPolicy ? raw + "-anonymous" : raw), $"{cluster}{path}");
                Write(settings, key, cluster, policy, prefix + path, verbs, removePrefix: prefix);
            }
        }
    }

    private static void Write(
        Dictionary<string, string?> settings,
        string key,
        string cluster,
        string policy,
        string path,
        IEnumerable<string> verbs,
        string? removePrefix)
    {
        var route = $"ReverseProxy:Routes:{key}";
        settings[$"{route}:ClusterId"] = cluster;
        settings[$"{route}:AuthorizationPolicy"] = policy;
        settings[$"{route}:Match:Path"] = path;

        var index = 0;
        foreach (var verb in verbs)
            settings[$"{route}:Match:Methods:{index++.ToString(CultureInfo.InvariantCulture)}"] = verb;

        if (removePrefix is null) return;
        settings[$"{route}:Transforms:0:PathRemovePrefix"] = removePrefix;
        if (!AnnouncesPrefix.Contains(cluster)) return;
        settings[$"{route}:Transforms:1:X-Forwarded"] = "Set";
        settings[$"{route}:Transforms:1:Prefix"] = "Off";
        settings[$"{route}:Transforms:2:RequestHeader"] = "X-Forwarded-Prefix";
        settings[$"{route}:Transforms:2:Set"] = removePrefix;
    }

    private static string Claim(Dictionary<string, string> seen, string key, string source)
    {
        if (seen.TryGetValue(key, out var prior))
            throw new InvalidOperationException($"Route key collision: {key} ({prior} vs {source}).");
        seen[key] = source;
        return key;
    }

    private static string Prefix(string cluster) =>
        ExposedSurface.ClusterPrefixes.TryGetValue(cluster, out var prefix)
            ? prefix
            : throw new InvalidOperationException($"No BFF prefix for cluster {cluster}.");

    private static (string Verb, string Path) Split(string entry)
    {
        var parts = entry.Split(' ', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2
            ? (parts[0], parts[1])
            : throw new InvalidOperationException($"exposed.json entry '{entry}' is not 'VERB /path'.");
    }

    private static string Key(string raw) => NonAlphanumeric().Replace(raw, "-").TrimEnd('-');

    [GeneratedRegex("[^a-zA-Z0-9]+")]
    private static partial Regex NonAlphanumeric();
}
