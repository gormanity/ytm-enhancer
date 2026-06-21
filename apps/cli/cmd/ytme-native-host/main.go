package main

import (
	"context"
	"log"
	"os"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/connector"
)

func main() {
	logPath := os.Getenv("YTME_LOG_PATH")
	if logPath == "" {
		logPath = "/tmp/ytme-native-host.log"
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		logFile = nil
	}
	if logFile != nil {
		defer logFile.Close()
		log.SetOutput(logFile)
	}

	if err := connector.Run(context.Background(), os.Stdin, os.Stdout, log.Writer()); err != nil {
		log.Printf("ytme native host failed: %s", err)
		os.Exit(1)
	}
}
