using System.IO.Compression;

namespace YTMTray.Core;

public static class ZipPackageExtractor
{
    private static readonly StringComparison PathComparison =
        OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;

    public static void Extract(string archivePath, string destinationDirectory)
    {
        using var archive = ZipFile.OpenRead(archivePath);
        Extract(archive, destinationDirectory);
    }

    public static void Extract(Stream archiveStream, string destinationDirectory)
    {
        using var archive = new ZipArchive(
            archiveStream,
            ZipArchiveMode.Read,
            leaveOpen: true
        );
        Extract(archive, destinationDirectory);
    }

    private static void Extract(
        ZipArchive archive,
        string destinationDirectory
    )
    {
        var destinationRoot = Path.GetFullPath(destinationDirectory);
        Directory.CreateDirectory(destinationRoot);

        foreach (var entry in archive.Entries)
        {
            var targetPath = Path.GetFullPath(
                Path.Combine(destinationRoot, entry.FullName)
            );
            if (!IsInsideDirectory(destinationRoot, targetPath))
            {
                throw new InvalidDataException(
                    "Update package contains an unsafe package path."
                );
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(targetPath);
                continue;
            }

            var targetDirectory = Path.GetDirectoryName(targetPath);
            if (targetDirectory is null)
            {
                throw new InvalidDataException(
                    "Update package contains an unsafe package path."
                );
            }

            Directory.CreateDirectory(targetDirectory);
            entry.ExtractToFile(targetPath, overwrite: false);
        }
    }

    private static bool IsInsideDirectory(string directory, string path)
    {
        var normalizedDirectory = directory.EndsWith(
            Path.DirectorySeparatorChar
        )
            ? directory
            : $"{directory}{Path.DirectorySeparatorChar}";
        return path.StartsWith(normalizedDirectory, PathComparison);
    }
}
