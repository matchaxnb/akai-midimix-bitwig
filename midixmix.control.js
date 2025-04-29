loadAPI(18)

host.defineController("Akai", "Akai Midimix", "0.1", "7b8cd61c-2718-4d77-80b5-a2103f92b69c", "mfeyx")
host.addDeviceNameBasedDiscoveryPair(["MIDI Mix"], ["MIDI Mix"])
host.defineMidiPorts(1, 1)

/* ------------------------------------------------------ */
/*                    DEBUGGING FEATURE                   */
/* ------------------------------------------------------ */
var DEBUG = true

function debug(bool = false) {
   DEBUG = bool
   return
}

/* ------------------------------------------------------ */
/*                         LOGGING                        */
/* ------------------------------------------------------ */
function log(msg) {
   if (DEBUG) { println(msg) }
}

/* ------------------------------------------------------ */
/*                       MIDI SPECS                       */
/* ------------------------------------------------------ */
const ON = 127
const OFF = 0

const NOTE_ON = 0x90
const NOTE_OFF = 0x80
const CC = 0xb0

const NUM_BANKS = 7

/* ------------------------------------------------------ */
/*                          NAMES                         */
/* ------------------------------------------------------ */
const KNOB = "encoder"
const MAIN = "mainVolume"
const CHAN = "chanVolume"

// do not change those values,
// they are called like the api methods, e.g. channel.solo()
const SOLO = "solo"
const MUTE = "mute"
const RECO = "arm"


/* ------------------------------------------------------ */
/*                         CONSTS                         */
/* ------------------------------------------------------ */
var SHIFT_PRESSED = false
var BANKL_PRESSED = false
var BANKR_PRESSED = false
var BANK_COUNTER = 0

/* ------------------------------------------------------ */
/*                        HARDWARE                        */
/* ------------------------------------------------------ */

/* ----------------- BUTTONS RIGHT PANEL ---------------- */
const BANKL = 0x19  // 25
const BANKR = 0x1A  // 26
const SHIFT = 0x1B  // 27

/* ----------------------- ENCODER ---------------------- */
const KNOBS = {
   "30": { send: 0, chan: 0 },
   "31": { send: 0, chan: 1 },
   "32": { send: 0, chan: 2 },
   "33": { send: 0, chan: 3 },
   "34": { send: 0, chan: 4 },
   "35": { send: 0, chan: 5 },
   "36": { send: 0, chan: 6 },
   "37": { send: 0, chan: 7 },
   "38": { send: 1, chan: 0 },
   "39": { send: 1, chan: 1 },
   "40": { send: 1, chan: 2 },
   "41": { send: 1, chan: 3 },
   "42": { send: 1, chan: 4 },
   "43": { send: 1, chan: 5 },
   "44": { send: 1, chan: 6 },
   "45": { send: 1, chan: 7 },
   "46": { send: 2, chan: 0 },
   "47": { send: 2, chan: 1 },
   "48": { send: 2, chan: 2 },
   "49": { send: 2, chan: 3 },
   "50": { send: 2, chan: 4 },
   "51": { send: 2, chan: 5 },
   "52": { send: 2, chan: 6 },
   "53": { send: 2, chan: 7 }
}

/* ----------------- CHANNEL CONTROLLER ----------------- */
const CC_MAPPING = {
   [KNOB]: {
      lo: 30,
      hi: 53,
   },
   [MUTE]: {
      lo: 12,
      hi: 19
   },
   [RECO]: {
      lo: 2,
      hi: 9,
   },
   [SOLO]: {
      lo: 20,
      hi: 27,
   },
   [CHAN]: {
      lo: 92,
      hi: 99
   },
   [MAIN]: 54
}

/* ------------------------- LED ------------------------ */
const LED_MUTE = [0x01, 0x04, 0x07, 0x0A, 0x0D, 0x10, 0x13, 0x16]
const LED_RECO = [0x03, 0x06, 0x09, 0x0C, 0x0F, 0x12, 0x15, 0x18]
const LED_SOLO = [0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B]  // ! NOT WORKING ATM

const LED_MAPPING = {
   [SOLO]: LED_SOLO, // row 1
   [RECO]: LED_RECO, // shift + row 1
   [MUTE]: LED_MUTE, // row 2
}

const LED_CACHE = {
   [SOLO]: [0, 0, 0, 0, 0, 0, 0, 0],
   [MUTE]: [0, 0, 0, 0, 0, 0, 0, 0],
   [RECO]: [0, 0, 0, 0, 0, 0, 0, 0],
}

/* ------------------------------------------------------ */
/*                         HELPERS                        */
/* ------------------------------------------------------ */
function isCCRangeMapped(name, cc) {
   var map = CC_MAPPING[name]
   return (cc >= map.lo && cc <= map.hi)
}

function toggleValue(value) {
   return value === 0 ? 127 : 0
}

function toggle(val) {
   return val === 127 ? 0 : 127
}

function toBool(val) {
   return val === 127 ? true : false
}

function handleError(error) {
   println(`${error.name}: ${error.message}`)
   return
}


/* ------------------------------------------------------ */
/*                     INIT CONTROLLER                    */
/* ------------------------------------------------------ */
function init() {
   // sending to host (bitwig)
   midiIn = host.getMidiInPort(0)
   midiIn.setMidiCallback(onMidi)

   // sending to controller (midimix) -> LED
   midiOut = host.getMidiOutPort(0)

   // 8 channel faders, 24 sends, 0 scenes
   trackBank = host.createMainTrackBank(8, NUM_BANKS * 3 + 3, 0)

   // main fader
   mainFader = host.createMasterTrack(0)
}

function exit() {
   log("exit()")
}

/* ------------------------------------------------------ */
/*                   MIDI STATUS HANDLER                  */
/* ------------------------------------------------------ */

/* ----------------------- NOTE ON ---------------------- */
function handleNoteOn(cc, value) {
   try {
      log(`handleNoteOn -> ${cc} : ${value}`)
      switch (cc) {
         case BANKL:
            log("BANK LEFT ON")
            BANKL_PRESSED = true;
            BANK_COUNTER = Math.max(BANK_COUNTER - 1, 0);
            break;
         case BANKR:
            log("BANK RIGHT ON")
            BANKR_PRESSED = true;
            BANK_COUNTER = Math.min(BANK_COUNTER + 1, NUM_BANKS);
            break;
         case SHIFT:
            SHIFT_PRESSED = !SHIFT_PRESSED && cc == SHIFT
            log(`SHIFT pressed: ${SHIFT_PRESSED}`)
            break;
         default:
            break;
      }
      return
   } catch (error) {
      handleError(error)
   }
}

/* ---------------------- NOTE OFF ---------------------- */
function handleNoteOff(cc, value) {
   try {
      log(`handleNoteOff -> ${cc} : ${value}`)
      switch (cc) {
         case BANKL:
            log("BANK LEFT OFF")
            BANKL_PRESSED = false
            break;
         case BANKR:
            log("BANK RIGHT OFF")
            BANKR_PRESSED = false
            break;
         case SHIFT:
            SHIFT_PRESSED = !SHIFT_PRESSED && cc == SHIFT
            log(`SHIFT pressed: ${SHIFT_PRESSED}`)
            break;
         default:
            break;
      }
      return
   } catch (error) {
      handleError(error)
   }
}

/* --------------------- MAIN FADER --------------------- */
function handleMainVolume(cc, value) {
   log(`Main Fader -> ${cc} : ${value}`)
   mainFader.getVolume().setRaw(value / 127)
}

/* -------------------- CHANNEL FADER ------------------- */
function handleChannelVolume(cc, value) {
   try {
      var index = cc - CC_MAPPING[CHAN].lo
      var channel = trackBank.getChannel(index)
      var volume = (value / 127) //* 0.8
      channel.getVolume().setRaw(volume)
      log(`Changing volume of channel ${index + 1} to ${value}`)
      return
   } catch (error) {
      handleError(error)
   }
}

/* ----------------------- BUTTONS ---------------------- */
function handleButton(cc, type, value) {
   debug(`BANK number is ${BANK_COUNTER}`);
   try {
      if (BANKL_PRESSED && BANKR_PRESSED && value === ON) {
         var index = cc - CC_MAPPING[type].lo
         var channel = trackBank.getChannel(index)
         BANK_COUNTER = Math.max(0, Math.min(index, NUM_BANKS))

      }
      else if (value === ON) {
         var index = cc - CC_MAPPING[type].lo
         var channel = trackBank.getChannel(index)
         var value = toggleValue(LED_CACHE[type][index])
         channel[type]().set(toBool(value))
         var led = LED_MAPPING[type][index]
         LED_CACHE[type][index] = value
         midiOut.sendMidi(NOTE_ON, led, value)
         log(`handleButton -> CH${index + 1} : ${type}`)
         return
      }
      return
   } catch (error) {
      handleError(error)
   }
}

/* ---------------------- ENCODERS ---------------------- */
function handleEncoder(cc, value) {
   try {
      log(`current bank: ${BANK_COUNTER}`)
      log(`handleEncoder -> ${cc} : ${value}`)
      var offset_send = BANK_COUNTER * 3
      var chan_index = KNOBS[cc].chan
      var send_index = KNOBS[cc].send + offset_send
      log(`setting send ${send_index} on channel ${chan_index} to value ${value}`)
      var channel = trackBank.getChannel(chan_index)
      channel.getSend(send_index).set(value, 128)
      return
   } catch (error) {
      handleError(error)
   }
}

/* ------------------------------------------------------ */
/*                   MIDI INPUT HANDLER                   */
/* ------------------------------------------------------ */
function onMidi(status, cc, value) {

   switch (true) {
      case isNoteOn(status): handleNoteOn(cc, value); break;
      case isNoteOff(status): handleNoteOff(cc, value); break;

      case isChannelController(status):
         // main volume
         if (cc === CC_MAPPING[MAIN]) { handleMainVolume(cc, value); break; }

         // channel volume
         if (isCCRangeMapped(CHAN, cc)) { handleChannelVolume(cc, value); break; }

         // buttons
         if (isCCRangeMapped(SOLO, cc)) { handleButton(cc, SOLO, value); break; }
         if (isCCRangeMapped(MUTE, cc)) { handleButton(cc, MUTE, value); break; }
         if (isCCRangeMapped(RECO, cc)) { handleButton(cc, RECO, value); break; }

         // encoders
         if (isCCRangeMapped(KNOB, cc)) { handleEncoder(cc, value); break; }

         // end
         break;

      default:
         prinltn(`UNKNOWN STATUS: ${status}, cc: ${cc}, value: ${value}`)
         break;
   }
   return
}
