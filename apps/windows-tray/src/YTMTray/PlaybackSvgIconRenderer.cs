using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Reflection;
using System.Xml.Linq;

namespace YTMTray;

internal static class PlaybackSvgIconRenderer
{
    private static readonly Lazy<IReadOnlyDictionary<PlaybackButtonIcon, SvgIconDefinition>> Icons =
        new(LoadIcons);

    private static readonly IReadOnlyDictionary<PlaybackButtonIcon, string> ResourceNames =
        new Dictionary<PlaybackButtonIcon, string>
        {
            [PlaybackButtonIcon.Shuffle] = "playback-shuffle",
            [PlaybackButtonIcon.Previous] = "playback-previous",
            [PlaybackButtonIcon.Play] = "playback-play",
            [PlaybackButtonIcon.Pause] = "playback-pause",
            [PlaybackButtonIcon.Next] = "playback-next",
            [PlaybackButtonIcon.Repeat] = "playback-repeat",
            [PlaybackButtonIcon.RepeatOne] = "playback-repeat-one"
        };

    public static bool Draw(
        Graphics graphics,
        PlaybackButtonIcon icon,
        Rectangle bounds,
        Color color
    )
    {
        if (!Icons.Value.TryGetValue(icon, out var definition))
        {
            return false;
        }

        var graphicsState = graphics.Save();
        try
        {
            graphics.TranslateTransform(bounds.X, bounds.Y);
            graphics.ScaleTransform(
                bounds.Width / definition.ViewBox.Width,
                bounds.Height / definition.ViewBox.Height
            );
            graphics.TranslateTransform(-definition.ViewBox.X, -definition.ViewBox.Y);

            using var brush = new SolidBrush(color);
            foreach (var element in definition.Elements)
            {
                if (element.Fill)
                {
                    graphics.FillPath(brush, element.Path);
                    continue;
                }

                using var pen = new Pen(color, element.StrokeWidth)
                {
                    StartCap = LineCap.Round,
                    EndCap = LineCap.Round,
                    LineJoin = LineJoin.Round
                };
                graphics.DrawPath(pen, element.Path);
            }
        }
        finally
        {
            graphics.Restore(graphicsState);
        }

        return true;
    }

    private static IReadOnlyDictionary<PlaybackButtonIcon, SvgIconDefinition> LoadIcons() =>
        ResourceNames.ToDictionary(entry => entry.Key, entry => LoadIcon(entry.Value));

    private static SvgIconDefinition LoadIcon(string resourceName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var manifestResourceName = assembly
            .GetManifestResourceNames()
            .FirstOrDefault(name =>
                name.EndsWith(
                    $"Resources.{resourceName}.svg",
                    StringComparison.Ordinal
                )
            );

        if (manifestResourceName is null)
        {
            throw new InvalidOperationException($"Missing playback icon resource {resourceName}.");
        }

        using var stream = assembly.GetManifestResourceStream(manifestResourceName);
        if (stream is null)
        {
            throw new InvalidOperationException($"Could not load playback icon {resourceName}.");
        }

        var document = XDocument.Load(stream);
        var svg = document.Root ?? throw new InvalidOperationException("SVG root is missing.");
        var viewBox = ParseViewBox(svg.Attribute("viewBox")?.Value);
        var elements = svg
            .Descendants()
            .Where(element => element.Name.LocalName == "path")
            .Select(ParsePathElement)
            .ToArray();

        return new SvgIconDefinition(viewBox, elements);
    }

    private static RectangleF ParseViewBox(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return new RectangleF(0, 0, 24, 24);
        }

        var parts = value
            .Split([' ', ','], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => float.Parse(part, CultureInfo.InvariantCulture))
            .ToArray();

        if (parts.Length != 4)
        {
            throw new InvalidOperationException($"Unsupported SVG viewBox '{value}'.");
        }

        return new RectangleF(parts[0], parts[1], parts[2], parts[3]);
    }

    private static SvgPathElement ParsePathElement(XElement element)
    {
        var pathData = element.Attribute("d")?.Value;
        if (string.IsNullOrWhiteSpace(pathData))
        {
            throw new InvalidOperationException("SVG path is missing path data.");
        }

        var fill = element.Attribute("fill")?.Value != "none";
        var strokeWidth = ParseOptionalFloat(element.Attribute("stroke-width")?.Value) ?? 1f;
        return new SvgPathElement(SvgPathParser.Parse(pathData), fill, strokeWidth);
    }

    private static float? ParseOptionalFloat(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : float.Parse(value, CultureInfo.InvariantCulture);

    private sealed record SvgIconDefinition(
        RectangleF ViewBox,
        IReadOnlyList<SvgPathElement> Elements
    );

    private sealed record SvgPathElement(GraphicsPath Path, bool Fill, float StrokeWidth);
}

internal static class SvgPathParser
{
    public static GraphicsPath Parse(string pathData)
    {
        var tokenizer = new SvgPathTokenizer(pathData);
        var path = new GraphicsPath(FillMode.Winding);
        var command = '\0';
        var currentPoint = PointF.Empty;
        var figureStart = PointF.Empty;

        while (!tokenizer.End)
        {
            if (tokenizer.TryReadCommand(out var nextCommand))
            {
                command = nextCommand;
            }

            if (command == '\0')
            {
                throw new InvalidOperationException($"SVG path command is missing in '{pathData}'.");
            }

            switch (char.ToUpperInvariant(command))
            {
                case 'M':
                    var firstMovePoint = true;
                    while (tokenizer.HasNumber)
                    {
                        var point = ReadPoint(tokenizer, currentPoint, char.IsLower(command));
                        if (firstMovePoint)
                        {
                            path.StartFigure();
                            figureStart = point;
                            firstMovePoint = false;
                        }
                        else
                        {
                            path.AddLine(currentPoint, point);
                        }

                        currentPoint = point;
                    }
                    break;
                case 'L':
                    while (tokenizer.HasNumber)
                    {
                        var point = ReadPoint(tokenizer, currentPoint, char.IsLower(command));
                        path.AddLine(currentPoint, point);
                        currentPoint = point;
                    }
                    break;
                case 'H':
                    while (tokenizer.HasNumber)
                    {
                        var x = tokenizer.ReadNumber();
                        if (char.IsLower(command))
                        {
                            x += currentPoint.X;
                        }

                        var point = new PointF(x, currentPoint.Y);
                        path.AddLine(currentPoint, point);
                        currentPoint = point;
                    }
                    break;
                case 'V':
                    while (tokenizer.HasNumber)
                    {
                        var y = tokenizer.ReadNumber();
                        if (char.IsLower(command))
                        {
                            y += currentPoint.Y;
                        }

                        var point = new PointF(currentPoint.X, y);
                        path.AddLine(currentPoint, point);
                        currentPoint = point;
                    }
                    break;
                case 'Z':
                    path.CloseFigure();
                    currentPoint = figureStart;
                    command = '\0';
                    break;
                default:
                    throw new InvalidOperationException(
                        $"Unsupported SVG path command '{command}'."
                    );
            }
        }

        return path;
    }

    private static PointF ReadPoint(
        SvgPathTokenizer tokenizer,
        PointF currentPoint,
        bool relative
    )
    {
        var x = tokenizer.ReadNumber();
        var y = tokenizer.ReadNumber();

        return relative
            ? new PointF(currentPoint.X + x, currentPoint.Y + y)
            : new PointF(x, y);
    }
}

internal sealed class SvgPathTokenizer
{
    private readonly string pathData;
    private int index;

    public SvgPathTokenizer(string pathData)
    {
        this.pathData = pathData;
    }

    public bool End
    {
        get
        {
            SkipSeparators();
            return index >= pathData.Length;
        }
    }

    public bool HasNumber
    {
        get
        {
            SkipSeparators();
            return index < pathData.Length
                && (
                    char.IsDigit(pathData[index])
                    || pathData[index] == '+'
                    || pathData[index] == '-'
                    || pathData[index] == '.'
                );
        }
    }

    public bool TryReadCommand(out char command)
    {
        SkipSeparators();
        if (index < pathData.Length && char.IsLetter(pathData[index]))
        {
            command = pathData[index++];
            return true;
        }

        command = '\0';
        return false;
    }

    public float ReadNumber()
    {
        SkipSeparators();
        var start = index;

        if (index < pathData.Length && (pathData[index] == '+' || pathData[index] == '-'))
        {
            index++;
        }

        ReadDigits();

        if (index < pathData.Length && pathData[index] == '.')
        {
            index++;
            ReadDigits();
        }

        if (index < pathData.Length && (pathData[index] == 'e' || pathData[index] == 'E'))
        {
            index++;
            if (index < pathData.Length && (pathData[index] == '+' || pathData[index] == '-'))
            {
                index++;
            }

            ReadDigits();
        }

        if (start == index)
        {
            throw new InvalidOperationException($"Expected SVG number in '{pathData}'.");
        }

        return float.Parse(pathData[start..index], CultureInfo.InvariantCulture);
    }

    private void ReadDigits()
    {
        while (index < pathData.Length && char.IsDigit(pathData[index]))
        {
            index++;
        }
    }

    private void SkipSeparators()
    {
        while (
            index < pathData.Length
            && (char.IsWhiteSpace(pathData[index]) || pathData[index] == ',')
        )
        {
            index++;
        }
    }
}
