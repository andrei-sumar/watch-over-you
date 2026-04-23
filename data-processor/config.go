package main

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	MIDI struct {
		PortName         string `yaml:"port_name"`
		Channel          uint8  `yaml:"channel"`
		TempoChangeCC    uint8  `yaml:"tempo_change_cc"`
		RapidGrowthCC    uint8  `yaml:"rapid_growth_cc"`
		DecreaseCC       uint8  `yaml:"decrease_cc"`
		MinTempo         uint8  `yaml:"min_tempo_bpm"`
		StartTransportCC uint8  `yaml:"start_transport_cc"`
	} `yaml:"midi"`
	Smoothing struct {
		WindowWidth          int `yaml:"window_width"`
		RapidGrowthThreshold int `yaml:"rapid_growth_threshold_bpm"`
		RapidGrowthCooldown  int `yaml:"rapid_growth_cooldown_seconds"`
	} `yaml:"smoothing"`
	DataSource struct {
		Type string `yaml:"type"`
		CSV  struct {
			Path string `yaml:"path"`
		} `yaml:"csv"`
	} `yaml:"data_source"`
}

func LoadConfig(configPath string) (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	if config.MIDI.Channel < 1 || config.MIDI.Channel > 16 {
		return nil, fmt.Errorf("midi.channel must be between 1 and 16")
	}
	config.MIDI.Channel -= 1 // it is 1..16 in config for readability, but should start with 0

	return &config, nil
}
