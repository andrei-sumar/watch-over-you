inlets = 3; // 0 = tempo, 1 = buffer size, 2 = jitter sensitivity
outlets = 5; // 0 = buffer, 1 = energy, 2 = jitter, 3 = st dev, 4 = key root note

var bufferSize = 10;

var energyDropPerSecond = 0.1;

var jitterSensitivity = 1;

// var cooldownSeconds = 10;

var state = {
    buffer: [],
    cooldown: 0,
    keyRootNote: 0
}

var zones = [
    [50, 64],
    [65, 89],
    [90, 119],
    [120, 139],
    [140, 177]
]

var energy = null;

function msg_int(v) {
    if (inlet === 1) {
        bufferSize = v;
        return;
    }

    if (inlet === 2) {
        jitterSensitivity = v;
        return;
    }

    if (energy === null) {
        energy = zones[getTempoZone(v)][0] * 1.0;
    }
    
    state.buffer.push(v);

    if (state.buffer.length > bufferSize) {
        state.buffer.splice(0, state.buffer.length - bufferSize);
    }
    outlet(0, state.buffer);

    if (state.buffer.length > 1) {

        var rmssd = getRmssd();
        outlet(2, rmssd);

        var stdDev = getStdDev();
        outlet(3, stdDev);    
         
        energy = normalizeEnergy(energy, v, stdDev);
    }

    outlet(1, v);

    outlet(4, state.keyRootNote);

    state.cooldown = Math.max(0, state.cooldown - 1);
}

function getRmssd() {
    var sumSq = 0;
    var n = state.buffer.length;

    for (var i = 1; i < n; i++) {
        var diff = state.buffer[i] - state.buffer[i - 1];
        sumSq += diff * diff;
    }

    var rmssd = Math.sqrt(sumSq / (n - 1));

    var k = 2; // smoothing factor
    var deadzone = 1 - jitterSensitivity;
    var adj = Math.max(0, rmssd - deadzone);
    return 1 - Math.exp(-adj / k);
}

function getStdDev() {
    // Sample standard deviation of the buffer (SDNN-like)
    var n = state.buffer.length;
    var mean = 0;
    for (var i = 0; i < n; i++) {
        mean += state.buffer[i];
    }
    mean /= n;

    var sumVar = 0;
    for (var i = 0; i < n; i++) {
        var d = state.buffer[i] - mean;
        sumVar += d * d;
    }
    return Math.sqrt(sumVar / (n - 1));
}

function getTempoZone(tempo) {
    for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (tempo >= z[0] && tempo <= z[1]) {
            return i;
        }
    }
}

function normalizeEnergy(energy, tempo, stdDev) {
    tempoZone = getTempoZone(tempo);

    var allowedEnergyRange;

    if (tempoZone === 0) {
        allowedEnergyRange = [zones[0][0], zones[1][1]];
    }else if (tempoZone === zones.length - 1) {
        allowedEnergyRange = [zones[tempoZone][0], zones[tempoZone][1]];
    }else{
        allowedEnergyRange = [zones[tempoZone][0], zones[tempoZone+1][1]];
    }

    var targetEnergy = energy;

    if (stdDev > 3/* && state.cooldown === 0*/) {
        targetEnergy += state.buffer[state.buffer.length - 1] - state.buffer[0];
        state.cooldown = bufferSize;
    }else{
        targetEnergy -= energyDropPerSecond;
    }

    if (targetEnergy < allowedEnergyRange[0]) {
        targetEnergy = allowedEnergyRange[0];
    } else if (targetEnergy > allowedEnergyRange[1]) {
        targetEnergy = allowedEnergyRange[1];
    }
    
    return targetEnergy;
}