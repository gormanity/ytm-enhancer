package protocol

const (
	ConnectorID      = "com.gormanity.ytm-enhancer.cli"
	ConnectorName    = "YTM Enhancer CLI"
	ConnectorVersion = "0.1.0"
	HostName         = "com.gormanity.ytm_enhancer.cli"
	ProtocolVersion  = "1.0.0"
)

var Permissions = []string{
	"playback:read",
	"playback:control",
	"track:read",
	"ytm:focus",
}

type TrackMetadata struct {
	Title      *string `json:"title"`
	Artist     *string `json:"artist"`
	Album      *string `json:"album"`
	Year       *int    `json:"year"`
	ArtworkURL *string `json:"artworkUrl"`
}

type PlaybackState struct {
	Title       *string        `json:"title"`
	Artist      *string        `json:"artist"`
	Album       *string        `json:"album"`
	Year        *int           `json:"year"`
	ArtworkURL  *string        `json:"artworkUrl"`
	NextTrack   *TrackMetadata `json:"nextTrack"`
	IsPlaying   bool           `json:"isPlaying"`
	Progress    float64        `json:"progress"`
	Duration    float64        `json:"duration"`
	IsShuffling *bool          `json:"isShuffling"`
	RepeatMode  *string        `json:"repeatMode"`
}

type HostMessage struct {
	Type            string         `json:"type"`
	RequestID       string         `json:"requestId,omitempty"`
	ConnectorID     string         `json:"connectorId,omitempty"`
	ProtocolVersion string         `json:"protocolVersion,omitempty"`
	Code            string         `json:"code,omitempty"`
	Message         string         `json:"message,omitempty"`
	State           *PlaybackState `json:"state,omitempty"`
}

func Hello(requestID string) map[string]any {
	return map[string]any{
		"type":      "connector.hello",
		"requestId": requestID,
		"manifest": map[string]any{
			"id":              ConnectorID,
			"name":            ConnectorName,
			"version":         ConnectorVersion,
			"protocolVersion": ProtocolVersion,
			"permissions":     Permissions,
		},
	}
}

func SubscribePlayback(requestID string) map[string]any {
	return map[string]any{
		"type":      "connector.subscribe",
		"requestId": requestID,
		"events":    []string{"playback.state"},
	}
}

func PlaybackStateRequest(requestID string) map[string]any {
	return map[string]any{
		"type":      "playback.getState",
		"requestId": requestID,
	}
}

func PlaybackAction(action string, requestID string) map[string]any {
	return map[string]any{
		"type":      "playback.action",
		"requestId": requestID,
		"action":    action,
	}
}

func PlaybackSeek(time float64, requestID string) map[string]any {
	return map[string]any{
		"type":      "playback.seek",
		"requestId": requestID,
		"time":      time,
	}
}

func FocusYouTubeMusic(requestID string) map[string]any {
	return map[string]any{
		"type":      "ytm.focus",
		"requestId": requestID,
	}
}
