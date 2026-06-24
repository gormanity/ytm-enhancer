using System.Buffers.Binary;
using System.Text.Json;

namespace YTMTray.Core;

public static class NativeMessagingCodec
{
    public const int MaxMessageBytes = 1024 * 1024;

    public static async Task<byte[]?> ReadPayloadAsync(
        Stream input,
        CancellationToken cancellationToken = default
    )
    {
        var header = await ReadExactAsync(input, 4, cancellationToken);
        if (header is null) return null;

        var length = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length > MaxMessageBytes)
        {
            throw new InvalidDataException(
                $"Native message is too large: {length} bytes."
            );
        }

        return await ReadExactAsync(input, checked((int)length), cancellationToken);
    }

    public static async Task<JsonDocument?> ReadJsonAsync(
        Stream input,
        CancellationToken cancellationToken = default
    )
    {
        var payload = await ReadPayloadAsync(input, cancellationToken);
        return payload is null ? null : JsonDocument.Parse(payload);
    }

    public static async Task WriteMessageAsync(
        Stream output,
        object message,
        CancellationToken cancellationToken = default
    )
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(message, JsonSettings.Options);
        await WritePayloadAsync(output, payload, cancellationToken);
    }

    public static async Task WritePayloadAsync(
        Stream output,
        byte[] payload,
        CancellationToken cancellationToken = default
    )
    {
        if (payload.Length > MaxMessageBytes)
        {
            throw new InvalidDataException(
                $"Native message is too large: {payload.Length} bytes."
            );
        }

        var header = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, checked((uint)payload.Length));
        await output.WriteAsync(header, cancellationToken);
        await output.WriteAsync(payload, cancellationToken);
        await output.FlushAsync(cancellationToken);
    }

    public static async Task<bool> CopyOneMessageAsync(
        Stream input,
        Stream output,
        CancellationToken cancellationToken = default
    )
    {
        var payload = await ReadPayloadAsync(input, cancellationToken);
        if (payload is null) return false;

        await WritePayloadAsync(output, payload, cancellationToken);
        return true;
    }

    private static async Task<byte[]?> ReadExactAsync(
        Stream input,
        int count,
        CancellationToken cancellationToken
    )
    {
        var buffer = new byte[count];
        var offset = 0;

        while (offset < count)
        {
            var read = await input.ReadAsync(
                buffer.AsMemory(offset, count - offset),
                cancellationToken
            );
            if (read == 0)
            {
                return offset == 0 ? null : throw new EndOfStreamException();
            }
            offset += read;
        }

        return buffer;
    }
}
