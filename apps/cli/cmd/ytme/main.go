package main

import (
	"os"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/cli"
)

func main() {
	os.Exit(cli.App{}.Run(os.Args[1:]))
}
