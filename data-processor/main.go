package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"gitlab.com/gomidi/midi/v2"
	_ "gitlab.com/gomidi/midi/v2/drivers/rtmididrv" // autoregisters driver
)

func main() {
	defer midi.CloseDriver()

	config, err := LoadConfig("config.yaml")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	out, err := midi.FindOutPort(config.MIDI.PortName)
	if err != nil {
		fmt.Printf("can't find output port: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("found outport: %s\n", out)

	windowWidth := config.Smoothing.WindowWidth
	rapidGrowthThreshold := config.Smoothing.RapidGrowthThreshold
	rapidGrowthCooldown := time.Duration(config.Smoothing.RapidGrowthCooldown) * time.Second

	processor := NewHeartRateProcessor(windowWidth, rapidGrowthThreshold)
	fmt.Printf("Initialized heart rate processor with window width: %d, rapid growth threshold: %d, cooldown: %v\n", windowWidth, rapidGrowthThreshold, rapidGrowthCooldown)

	var lastRapidChangeTime time.Time
	var transportStartSent bool
	var previousMeasuredAt int64

	var fetcher HeartRateFetcher

	switch config.DataSource.Type {
	case "csv":
		fetcher, err = NewCSVFetcher(config.DataSource.CSV.Path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error initializing CSV fetcher: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Using sample data from CSV file: %s\n", config.DataSource.CSV.Path)
	case "pulsoid":
		token := os.Getenv("PULSOID_TOKEN")
		if token == "" {
			fmt.Fprintf(os.Stderr, "Error: PULSOID_TOKEN environment variable not set\n")
			os.Exit(1)
		}
		client := &http.Client{Timeout: 10 * time.Second}
		fetcher = NewPulsoidFetcher(client, token)
		fmt.Println("Using Pulsoid API")
	default:
		fmt.Fprintf(os.Stderr, "Error: invalid data_source.type in config. Must be 'csv' or 'pulsoid'\n")
		os.Exit(1)
	}

	for {
		hrResp, err := fetcher.FetchHeartRate()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			time.Sleep(1 * time.Second)
			continue
		}

		hr := hrResp.Data.HeartRate
		smoothedHR := processor.AddValue(hr)
		fmt.Printf("Measured at: %d, Heart rate: %d (smoothed: %d)\n", hrResp.MeasuredAt, hr, smoothedHR)

		if processor.HasRapidGrowth() {
			timeSinceLastRapidChange := time.Since(lastRapidChangeTime)
			if timeSinceLastRapidChange >= rapidGrowthCooldown {
				if err := sendMIDICC(out, config.MIDI.Channel, config.MIDI.RapidGrowthCC, 127); err != nil {
					fmt.Fprintf(os.Stderr, "Error sending rapid growth MIDI CC: %v\n", err)
				} else {
					//fmt.Println("Rapid growth detected - MIDI CC sent successfully")
					lastRapidChangeTime = time.Now()
				}
			} else {
				//fmt.Printf("Rapid growth detected but cooldown active (%.1fs remaining)\n", (rapidGrowthCooldown - timeSinceLastRapidChange).Seconds())
			}
		} else if processor.HasDecrease() { //todo: definitely refactor
			timeSinceLastRapidChange := time.Since(lastRapidChangeTime)
			if timeSinceLastRapidChange >= rapidGrowthCooldown {
				if err := sendMIDICC(out, config.MIDI.Channel, config.MIDI.DecreaseCC, 127); err != nil {
					fmt.Fprintf(os.Stderr, "Error sending decrease MIDI CC: %v\n", err)
				} else {
					//fmt.Println("Decrease detected - MIDI CC sent successfully")
					lastRapidChangeTime = time.Now()
				}
			} else {
				//fmt.Printf("Decrease detected but cooldown active (%.1fs remaining)\n", (rapidGrowthCooldown - timeSinceLastRapidChange).Seconds())
			}
		}

		cc := mapHRtoCC(smoothedHR, config.MIDI.MinTempo)
		if err := sendMIDICC(out, config.MIDI.Channel, config.MIDI.TempoChangeCC, cc); err != nil {
			fmt.Fprintf(os.Stderr, "Error sending MIDI CC: %v\n", err)
		} else {
			fmt.Println("MIDI CC sent successfully")

			// Send transport start CC once after first tempo change
			if !transportStartSent {
				if err := sendMIDICC(out, config.MIDI.Channel, config.MIDI.StartTransportCC, 127); err != nil {
					fmt.Fprintf(os.Stderr, "Error sending transport start MIDI CC: %v\n", err)
				} else {
					fmt.Println("Transport start MIDI CC sent")
					transportStartSent = true
				}
			}
		}

		// Calculate sleep duration based on timestamp difference in CSV mode
		var sleepDuration time.Duration
		if config.DataSource.Type == "csv" && previousMeasuredAt > 0 {
			// measuredAt is in milliseconds
			timeDiffMs := hrResp.MeasuredAt - previousMeasuredAt
			if timeDiffMs > 0 {
				sleepDuration = time.Duration(timeDiffMs) * time.Millisecond
			} else {
				// If timestamps are not increasing (e.g., looped back to start), use default
				sleepDuration = 1 * time.Second
			}
		} else {
			sleepDuration = 1 * time.Second
		}
		previousMeasuredAt = hrResp.MeasuredAt

		time.Sleep(sleepDuration)
	}
}
