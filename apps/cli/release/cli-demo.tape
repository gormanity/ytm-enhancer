Output apps/cli/release/cli-demo.webm

Require bash
Require ffmpeg

Set Shell "bash"
Set FontSize 24
Set FontFamily "SFMono-Regular, Menlo, Monaco, Consolas, monospace"
Set Width 960
Set Height 540
Set Padding 34
Set Framerate 30
Set TypingSpeed 36ms
Set LineHeight 1.16
Set Theme "GitHub Dark"
Set WindowBar "Colorful"
Set WindowBarSize 38
Set BorderRadius 16
Set MarginFill "#050506"
Set Margin 18

Hide
Type "tmp=$(mktemp -d)" Enter
Type "cat > $tmp/ytme <<'EOF'" Enter
Type "#!/usr/bin/env bash" Enter
Type "case $1 in" Enter
Type "  doctor)" Enter
Type "    echo 'OK    Connector: connected to YTM Enhancer'" Enter
Type "    echo 'OK    Browser: Firefox'" Enter
Type "    echo 'OK    Native host: com.gormanity.ytm_enhancer.cli'" Enter
Type "    ;;" Enter
Type "  status)" Enter
Type "    echo 'Playing  A Walk'" Enter
Type "    echo 'Artist   Tycho'" Enter
Type "    echo 'Album    Dive'" Enter
Type "    echo 'Time     2:58 / 5:17'" Enter
Type "    ;;" Enter
Type "  pause)" Enter
Type "    echo 'Paused YouTube Music'" Enter
Type "    ;;" Enter
Type "  focus)" Enter
Type "    echo 'Focused YouTube Music'" Enter
Type "    ;;" Enter
Type "esac" Enter
Type "EOF" Enter
Type "chmod +x $tmp/ytme" Enter
Type "export PATH=$tmp:$PATH" Enter
Type "export PS1='$ '" Enter
Type "clear" Enter
Show

Sleep 700ms
Type "ytme doctor" Enter
Sleep 1400ms
Type "ytme status" Enter
Sleep 1800ms
Type "ytme pause" Enter
Sleep 1200ms
Type "ytme focus" Enter
Sleep 2200ms
