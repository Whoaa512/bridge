package discover

import (
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func goos() string {
	return runtime.GOOS
}

func getUptime() int64 {
	if runtime.GOOS == "darwin" {
		return getDarwinUptime()
	}
	return getLinuxUptime()
}

func getDarwinUptime() int64 {
	out, err := runCmd("sysctl", "-n", "kern.boottime")
	if err != nil {
		return 0
	}
	parts := strings.Split(out, "=")
	if len(parts) < 2 {
		return 0
	}
	secStr := strings.TrimSpace(strings.Split(parts[1], ",")[0])
	sec, err := strconv.ParseInt(secStr, 10, 64)
	if err != nil {
		return 0
	}
	return time.Now().Unix() - sec
}

func getLinuxUptime() int64 {
	out, err := runCmd("cat", "/proc/uptime")
	if err != nil {
		return 0
	}
	parts := strings.Fields(out)
	if len(parts) < 1 {
		return 0
	}
	secs, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0
	}
	return int64(secs)
}

func runCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	out, err := cmd.Output()
	return string(out), err
}
