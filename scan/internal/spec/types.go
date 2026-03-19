package spec

import "time"

const Version = "0.1.0"

type BridgeSpec struct {
	Version        string         `json:"version"`
	ScannedAt      time.Time      `json:"scannedAt"`
	Machine        Machine        `json:"machine"`
	Projects       []Project      `json:"projects"`
	Infrastructure Infrastructure `json:"infrastructure"`
	Alerts         []Alert        `json:"alerts"`
	Cycle          Cycle          `json:"cycle"`
}

type Machine struct {
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Uptime   int64  `json:"uptime"`
}

type Project struct {
	ID                   string     `json:"id"`
	Path                 string     `json:"path"`
	Name                 string     `json:"name"`
	Kind                 string     `json:"kind"`
	Classification       string     `json:"classification"`
	ClassificationSource string     `json:"classificationSource"`
	Languages            []string   `json:"languages"`
	Git                  *GitStatus `json:"git"`
	CI                   *CIStatus  `json:"ci"`
	PRs                  []PR       `json:"prs"`
	Tasks                []Task     `json:"tasks"`
	Size                 *Size      `json:"size"`
	Activity             *Activity  `json:"activity"`
	Subprojects          []string   `json:"subprojects"`
	Priority             *int       `json:"priority"`
	Flags                []string   `json:"flags"`
	Errors               []ScanErr  `json:"errors"`
}

type GitStatus struct {
	Branch      string    `json:"branch"`
	Uncommitted int       `json:"uncommitted"`
	Ahead       int       `json:"ahead"`
	Behind      int       `json:"behind"`
	StashCount  int       `json:"stashCount"`
	LastCommit  time.Time `json:"lastCommit"`
	RemoteURL   *string   `json:"remoteUrl"`
}

type CIStatus struct {
	Status    string    `json:"status"`
	URL       *string   `json:"url"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type PR struct {
	Number       int    `json:"number"`
	Title        string `json:"title"`
	State        string `json:"state"`
	ReviewStatus string `json:"reviewStatus"`
	URL          string `json:"url"`
}

type Task struct {
	GID       string `json:"gid"`
	Name      string `json:"name"`
	Completed bool   `json:"completed"`
	URL       string `json:"url"`
}

type Size struct {
	LOC   int `json:"loc"`
	Files int `json:"files"`
	Deps  int `json:"deps"`
}

type Activity struct {
	LastTouch       time.Time `json:"lastTouch"`
	CommitsThisWeek int       `json:"commitsThisWeek"`
	StaleDays       int       `json:"staleDays"`
}

type ScanErr struct {
	Source  string    `json:"source"`
	Message string   `json:"message"`
	At      time.Time `json:"at"`
}

type Infrastructure struct {
	Ports     []Port            `json:"ports"`
	Docker    []DockerContainer `json:"docker"`
	Resources Resources         `json:"resources"`
}

type Port struct {
	Port      int     `json:"port"`
	PID       int     `json:"pid"`
	Process   string  `json:"process"`
	CWD       string  `json:"cwd"`
	ProjectID *string `json:"projectId"`
	URL       string  `json:"url,omitempty"`
}

type DockerContainer struct {
	ContainerID string       `json:"containerId"`
	Image       string       `json:"image"`
	Name        string       `json:"name"`
	Status      string       `json:"status"`
	Ports       []PortMap    `json:"ports"`
	ProjectID   *string      `json:"projectId"`
}

type PortMap struct {
	Host      int `json:"host"`
	Container int `json:"container"`
}

type Resources struct {
	CPUByProject map[string]float64 `json:"cpuByProject"`
	MemByProject map[string]int64   `json:"memByProject"`
}

type Alert struct {
	Severity  string  `json:"severity"`
	ProjectID *string `json:"projectId"`
	Type      string  `json:"type"`
	Message   string  `json:"message"`
	URL       *string `json:"url,omitempty"`
}

type Cycle struct {
	Period  string       `json:"period"`
	Start   time.Time    `json:"start"`
	End     time.Time    `json:"end"`
	Summary CycleSummary `json:"summary"`
}

type CycleSummary struct {
	CommitsTotal   int `json:"commitsTotal"`
	ProjectsActive int `json:"projectsActive"`
	PRsOpened      int `json:"prsOpened"`
	PRsMerged      int `json:"prsMerged"`
	AlertsNew      int `json:"alertsNew"`
	AlertsResolved int `json:"alertsResolved"`
}
