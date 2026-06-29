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

        return SvgIconRenderer.Draw(graphics, definition, bounds, color);
    }

    private static IReadOnlyDictionary<PlaybackButtonIcon, SvgIconDefinition> LoadIcons() =>
        ResourceNames.ToDictionary(entry => entry.Key, entry => SvgIconRenderer.Load(entry.Value));
}

internal static class PopupActionSvgIconRenderer
{
    private static readonly Lazy<IReadOnlyDictionary<PopupActionIcon, SvgIconDefinition>> Icons =
        new(LoadIcons);

    private static readonly IReadOnlyDictionary<PopupActionIcon, string> ResourceNames =
        new Dictionary<PopupActionIcon, string>
        {
            [PopupActionIcon.Focus] = "action-focus",
            [PopupActionIcon.Update] = "action-update",
            [PopupActionIcon.Info] = "action-info",
            [PopupActionIcon.Quit] = "action-quit"
        };

    public static bool Draw(Graphics graphics, PopupActionIcon icon, Rectangle bounds, Color color)
    {
        if (!Icons.Value.TryGetValue(icon, out var definition))
        {
            return false;
        }

        return SvgIconRenderer.Draw(graphics, definition, bounds, color);
    }

    private static IReadOnlyDictionary<PopupActionIcon, SvgIconDefinition> LoadIcons() =>
        ResourceNames.ToDictionary(entry => entry.Key, entry => SvgIconRenderer.Load(entry.Value));
}

internal static class StatusSvgIconRenderer
{
    public const string IdleResourceName = "extension-icon-monochrome";
    public const string PlayingResourceName = "extension-icon-monochrome-ring";

    private static readonly Lazy<IReadOnlyDictionary<string, SvgIconDefinition>> Icons =
        new(LoadIcons);

    public static bool Draw(Graphics graphics, string resourceName, Rectangle bounds, Color color)
    {
        if (!Icons.Value.TryGetValue(resourceName, out var definition))
        {
            return false;
        }

        return SvgIconRenderer.Draw(graphics, definition, bounds, color);
    }

    private static IReadOnlyDictionary<string, SvgIconDefinition> LoadIcons()
    {
        var resourceNames = new[] { IdleResourceName, PlayingResourceName };
        return resourceNames.ToDictionary(resourceName => resourceName, SvgIconRenderer.Load);
    }
}

internal static class SvgIconRenderer
{
    public static bool Draw(
        Graphics graphics,
        SvgIconDefinition definition,
        Rectangle bounds,
        Color color
    )
    {
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

    public static SvgIconDefinition Load(string resourceName)
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
            throw new InvalidOperationException($"Missing icon resource {resourceName}.");
        }

        using var stream = assembly.GetManifestResourceStream(manifestResourceName);
        if (stream is null)
        {
            throw new InvalidOperationException($"Could not load icon {resourceName}.");
        }

        var document = XDocument.Load(stream);
        var svg = document.Root ?? throw new InvalidOperationException("SVG root is missing.");
        var viewBox = ParseViewBox(svg.Attribute("viewBox")?.Value);
        var elements = svg
            .Descendants()
            .SelectMany(ParseGraphicElement)
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

    private static IEnumerable<SvgPathElement> ParseGraphicElement(XElement element)
    {
        switch (element.Name.LocalName)
        {
            case "path":
                yield return ParsePathElement(element);
                break;
            case "line":
                yield return ParseLineElement(element);
                break;
            case "circle":
                yield return ParseCircleElement(element);
                break;
            case "polygon":
                yield return ParsePolygonElement(element, closePath: true);
                break;
            case "polyline":
                yield return ParsePolygonElement(element, closePath: false);
                break;
        }
    }

    private static SvgPathElement ParsePathElement(XElement element)
    {
        var pathData = element.Attribute("d")?.Value;
        if (string.IsNullOrWhiteSpace(pathData))
        {
            throw new InvalidOperationException("SVG path is missing path data.");
        }

        var fill = AttributeValue(element, "fill") != "none";
        var fillMode = AttributeValue(element, "fill-rule") == "evenodd"
            ? FillMode.Alternate
            : FillMode.Winding;
        var strokeWidth = ParseOptionalFloat(AttributeValue(element, "stroke-width")) ?? 1f;
        return new SvgPathElement(SvgPathParser.Parse(pathData, fillMode), fill, strokeWidth);
    }

    private static SvgPathElement ParseLineElement(XElement element)
    {
        var x1 = ParseRequiredFloat(element, "x1");
        var y1 = ParseRequiredFloat(element, "y1");
        var x2 = ParseRequiredFloat(element, "x2");
        var y2 = ParseRequiredFloat(element, "y2");
        var path = new GraphicsPath();
        path.AddLine(x1, y1, x2, y2);
        return new SvgPathElement(path, false, StrokeWidth(element));
    }

    private static SvgPathElement ParseCircleElement(XElement element)
    {
        var cx = ParseRequiredFloat(element, "cx");
        var cy = ParseRequiredFloat(element, "cy");
        var radius = ParseRequiredFloat(element, "r");
        var path = new GraphicsPath();
        path.AddEllipse(cx - radius, cy - radius, radius * 2, radius * 2);
        var fill = AttributeValue(element, "fill") != "none";
        return new SvgPathElement(path, fill, StrokeWidth(element));
    }

    private static SvgPathElement ParsePolygonElement(XElement element, bool closePath)
    {
        var points = (element.Attribute("points")?.Value ?? "")
            .Split([' ', ','], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => float.Parse(part, CultureInfo.InvariantCulture))
            .ToArray();
        if (points.Length < 4 || points.Length % 2 != 0)
        {
            throw new InvalidOperationException("SVG polygon points are invalid.");
        }

        var path = new GraphicsPath();
        var pathPoints = Enumerable
            .Range(0, points.Length / 2)
            .Select(index => new PointF(points[index * 2], points[index * 2 + 1]))
            .ToArray();

        if (closePath)
        {
            path.AddPolygon(pathPoints);
        }
        else
        {
            path.AddLines(pathPoints);
        }

        var fill = closePath && AttributeValue(element, "fill") != "none";
        return new SvgPathElement(path, fill, StrokeWidth(element));
    }

    private static float ParseRequiredFloat(XElement element, string attributeName)
    {
        var value = element.Attribute(attributeName)?.Value;
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"SVG element is missing {attributeName}."
            );
        }

        return float.Parse(value, CultureInfo.InvariantCulture);
    }

    private static float StrokeWidth(XElement element) =>
        ParseOptionalFloat(AttributeValue(element, "stroke-width")) ?? 1f;

    private static string? AttributeValue(XElement element, string attributeName)
    {
        for (XElement? current = element; current is not null; current = current.Parent)
        {
            var value = current.Attribute(attributeName)?.Value;
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static float? ParseOptionalFloat(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : float.Parse(value, CultureInfo.InvariantCulture);
}

internal sealed record SvgIconDefinition(
    RectangleF ViewBox,
    IReadOnlyList<SvgPathElement> Elements
);

internal sealed record SvgPathElement(GraphicsPath Path, bool Fill, float StrokeWidth);

internal static class SvgPathParser
{
    public static GraphicsPath Parse(string pathData, FillMode fillMode = FillMode.Winding)
    {
        var tokenizer = new SvgPathTokenizer(pathData);
        var path = new GraphicsPath(fillMode);
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
                case 'A':
                    while (tokenizer.HasNumber)
                    {
                        var arc = ReadArc(tokenizer, currentPoint, char.IsLower(command));
                        AddArc(path, currentPoint, arc);
                        currentPoint = arc.EndPoint;
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

    private static SvgArc ReadArc(
        SvgPathTokenizer tokenizer,
        PointF currentPoint,
        bool relative
    )
    {
        var rx = Math.Abs(tokenizer.ReadNumber());
        var ry = Math.Abs(tokenizer.ReadNumber());
        var xAxisRotation = tokenizer.ReadNumber();
        var largeArc = Math.Abs(tokenizer.ReadNumber()) > 0.5f;
        var sweep = Math.Abs(tokenizer.ReadNumber()) > 0.5f;
        var endPoint = ReadPoint(tokenizer, currentPoint, relative);
        return new SvgArc(rx, ry, xAxisRotation, largeArc, sweep, endPoint);
    }

    private static void AddArc(GraphicsPath path, PointF startPoint, SvgArc arc)
    {
        if (arc.RadiusX <= 0 || arc.RadiusY <= 0 || startPoint == arc.EndPoint)
        {
            path.AddLine(startPoint, arc.EndPoint);
            return;
        }

        var rotationRadians = DegreesToRadians(arc.XAxisRotation);
        var cosRotation = Math.Cos(rotationRadians);
        var sinRotation = Math.Sin(rotationRadians);
        var dx = (startPoint.X - arc.EndPoint.X) / 2.0;
        var dy = (startPoint.Y - arc.EndPoint.Y) / 2.0;
        var x1 = cosRotation * dx + sinRotation * dy;
        var y1 = -sinRotation * dx + cosRotation * dy;
        var rx = arc.RadiusX;
        var ry = arc.RadiusY;
        var radiusCorrection =
            (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);

        if (radiusCorrection > 1)
        {
            var scale = Math.Sqrt(radiusCorrection);
            rx *= (float)scale;
            ry *= (float)scale;
        }

        var rxSquared = rx * rx;
        var rySquared = ry * ry;
        var x1Squared = x1 * x1;
        var y1Squared = y1 * y1;
        var sign = arc.LargeArc == arc.Sweep ? -1 : 1;
        var centerScaleNumerator =
            rxSquared * rySquared - rxSquared * y1Squared - rySquared * x1Squared;
        var centerScaleDenominator =
            rxSquared * y1Squared + rySquared * x1Squared;
        var centerScale =
            sign
            * Math.Sqrt(
                Math.Max(0, centerScaleNumerator / Math.Max(centerScaleDenominator, double.Epsilon))
            );
        var cx1 = centerScale * rx * y1 / ry;
        var cy1 = -centerScale * ry * x1 / rx;
        var cx =
            cosRotation * cx1 - sinRotation * cy1 + (startPoint.X + arc.EndPoint.X) / 2.0;
        var cy =
            sinRotation * cx1 + cosRotation * cy1 + (startPoint.Y + arc.EndPoint.Y) / 2.0;

        var startVector = new PointF((float)((x1 - cx1) / rx), (float)((y1 - cy1) / ry));
        var endVector = new PointF((float)((-x1 - cx1) / rx), (float)((-y1 - cy1) / ry));
        var startAngle = VectorAngle(new PointF(1, 0), startVector);
        var sweepAngle = VectorAngle(startVector, endVector);

        if (!arc.Sweep && sweepAngle > 0)
        {
            sweepAngle -= 360;
        }
        else if (arc.Sweep && sweepAngle < 0)
        {
            sweepAngle += 360;
        }

        var arcBounds = new RectangleF(
            (float)(cx - rx),
            (float)(cy - ry),
            rx * 2,
            ry * 2
        );

        if (Math.Abs(arc.XAxisRotation) < 0.001)
        {
            path.AddArc(arcBounds, (float)startAngle, (float)sweepAngle);
            return;
        }

        using var arcPath = new GraphicsPath();
        arcPath.AddArc(arcBounds, (float)startAngle, (float)sweepAngle);
        using var transform = new Matrix();
        transform.RotateAt(arc.XAxisRotation, new PointF((float)cx, (float)cy));
        arcPath.Transform(transform);
        path.AddPath(arcPath, true);
    }

    private static double VectorAngle(PointF a, PointF b)
    {
        var dot = a.X * b.X + a.Y * b.Y;
        var length = Math.Sqrt((a.X * a.X + a.Y * a.Y) * (b.X * b.X + b.Y * b.Y));
        var angle = Math.Acos(Math.Clamp(dot / Math.Max(length, double.Epsilon), -1, 1));
        var cross = a.X * b.Y - a.Y * b.X;
        return RadiansToDegrees(cross < 0 ? -angle : angle);
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;

    private static double RadiansToDegrees(double radians) => radians * 180.0 / Math.PI;

    private sealed record SvgArc(
        float RadiusX,
        float RadiusY,
        float XAxisRotation,
        bool LargeArc,
        bool Sweep,
        PointF EndPoint
    );
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
