inlets = 2;
outlets = 1;

var octaveRange = 1;
var outputVelocity = 100;

var state = {
    activeNotes: {}
};

function msg_int(v) {
    if (inlet === 0) {
        handleList([v]);
    } else if (inlet === 1) {
        octaveRange = v;
    }
}

// list of pitch classes to be arranged to the smoothest and widest voicing
function list() {
    handleList(arrayfromargs(arguments));
}

// bang clears currently held notes
function bang() {
    for (var noteStr in state.activeNotes) {
        var note = parseInt(noteStr, 10);
        outlet(0, note, 0);
    }
    state.activeNotes = {};
}

function handleList(pitchClasses) {
    var noteOns = [];
    var noteOffs = [];

    // set note offs for notes which are not present in the new chord
    for (var noteStr in state.activeNotes) {
        var note = parseInt(noteStr, 10);
        if (pitchClasses.indexOf(note % 12) === -1) {
            noteOffs.push(note);
        }
    }

    // find pitch classes from the new chord which are not currently played and therefore need to be arranged
    var pitchClassesToArrange = [];
    var sustainingNotes = [];
    for (var i = 0; i < pitchClasses.length; ++i) {
        var isHeld = false;
        for (var noteStr in state.activeNotes) {
            var note = parseInt(noteStr, 10);
            if (note % 12 === pitchClasses[i]) {
                sustainingNotes.push(note);
                isHeld = true;
                break;
            }
        }

        if (isHeld === false) {
            pitchClassesToArrange.push(pitchClasses[i]);
        }
    }

    noteOns = findSmoothestVoicing(pitchClassesToArrange, sustainingNotes);

    for (var i = 0; i < noteOns.length; ++i) {
        outlet(0, noteOns[i], outputVelocity);
        state.activeNotes[noteOns[i]] = 1;
    }
    for (var i = 0; i < noteOffs.length; ++i) {
        outlet(0, noteOffs[i], 0);
        delete state.activeNotes[noteOffs[i]];
    }
}

// arranges pitchClassesToArange across octaveRange so that the hops from tones of previous chords are minimal
// sustainingNotes contains absolute pitches of notes which are common between the two chords and therefore need not to be played
// in case there are multiple voicings with minimal hops, the widest voicing is favoured
function findSmoothestVoicing(pitchClassesToArrange, sustainingNotes) {
    if (pitchClassesToArrange.length === 0) return [];

    var voicesCount = pitchClassesToArrange.length;
    var octaveCombinationsCount = Math.pow(octaveRange, voicesCount);
    var activeNotes = Object.keys(state.activeNotes);

    var bestVoicing = null;
    var bestDist = Infinity;
    var bestWidth = -Infinity;

    for (var octaveCombination = 0; octaveCombination < octaveCombinationsCount; octaveCombination++) {

        // generate octave assignment (radix counting)
        var octs = [];
        var n = octaveCombination;
        for (var v = 0; v < voicesCount; v++) {
            octs[v] = n % octaveRange;
            n = Math.floor(n / octaveRange);
        }

        // construct absolute pitches of the voicing
        var pitchesToAdd = [];
        for (var v = 0; v < voicesCount; v++) {
            pitchesToAdd[v] = pitchClassesToArrange[v] + 12 * octs[v];
        }

        var pitches = pitchesToAdd.concat(sustainingNotes);
        pitches.sort(function (a, b) { return a - b; });

        var maxDist = -Infinity;

        // greedily find which tones flow into which
        var curActiveNotes = activeNotes.slice();
        var curPitches = pitches.slice();

        while (curActiveNotes.length && curPitches.length) {
            var minDist = Infinity;
            var minJ, minK;
            for (var j = 0; j < curPitches.length; ++j) {
                for (var k = 0; k < curActiveNotes.length; ++k) {
                    var curDist = Math.abs(curPitches[j] - curActiveNotes[k]);
                    if (curDist < minDist) {
                        minDist = curDist;
                        minJ = j;
                        minK = k;
                    }
                }
            }

            curActiveNotes.splice(minK, 1);
            curPitches.splice(minJ, 1);

            if (minDist > maxDist) {
                maxDist = minDist;
            }
        }

        // find minimal interval between adjacent chord tones in the voicing
        var minAdj = Infinity;
        for (var v = 0; v < pitches.length - 1; v++) {
            var d = Math.abs(pitches[v + 1] - pitches[v]);
            if (d < minAdj) minAdj = d;
        }

        if (maxDist < bestDist || (maxDist == bestDist && minAdj > bestWidth)) {
            bestVoicing = pitchesToAdd;
            bestDist = maxDist;
            bestWidth = minAdj;
        }
    }

    return bestVoicing;
}
