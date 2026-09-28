using System.Text.RegularExpressions;

namespace LupiraAssistantBff.Auth;

/// <summary>
/// The device-ingest credential. Only location-api holds the device keys, so the BFF cannot verify one —
/// it checks the header is well formed, forwards it untouched, and lets the upstream authenticate.
/// </summary>
internal static partial class DeviceKeyHeader
{
    public const string Scheme = "DeviceKey ";

    /// <summary>Whether the value could be a device key: <c>DeviceKey {32hex}.{64hex}</c>.</summary>
    public static bool IsWellFormed(string? header) =>
        header is not null
        && header.StartsWith(Scheme, StringComparison.Ordinal)
        && KeyPattern().IsMatch(header[Scheme.Length..].Trim());

    [GeneratedRegex("^[0-9a-f]{32}\\.[0-9a-f]{64}$", RegexOptions.IgnoreCase)]
    private static partial Regex KeyPattern();
}
