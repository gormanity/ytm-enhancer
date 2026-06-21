package native

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

const maxMessageBytes = 1024 * 1024

type Connection struct {
	input  io.Reader
	output io.Writer
	mu     sync.Mutex
}

func NewConnection(input io.Reader, output io.Writer) *Connection {
	return &Connection{input: input, output: output}
}

func (connection *Connection) Read(value any) error {
	var length uint32
	if err := binary.Read(connection.input, binary.LittleEndian, &length); err != nil {
		return err
	}
	if length > maxMessageBytes {
		return fmt.Errorf("native message too large: %d bytes", length)
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(connection.input, payload); err != nil {
		return err
	}
	if err := json.Unmarshal(payload, value); err != nil {
		return fmt.Errorf("decode native message: %w", err)
	}
	return nil
}

func (connection *Connection) Write(value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("encode native message: %w", err)
	}
	if len(payload) > maxMessageBytes {
		return fmt.Errorf("native message too large: %d bytes", len(payload))
	}

	connection.mu.Lock()
	defer connection.mu.Unlock()

	if err := binary.Write(connection.output, binary.LittleEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = connection.output.Write(payload)
	return err
}
