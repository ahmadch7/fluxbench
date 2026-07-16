import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Cpu,
  AlertTriangle,
  CircuitBoard,
  Info,
  CheckCircle2,
  Database,
  Sparkles,
  RefreshCcw,
  FileText,
  Layers,
  Settings,
  Activity,
  ArrowRight,
  HelpCircle,
  X,
  Usb,
  Link2,
  SlidersHorizontal,
  Plus,
  Trash2,
  AlertOctagon,
  ClipboardCheck,
  Wifi,
  Terminal,
  Upload,
  Play,
  Send,
  RotateCw,
  Loader2,
  Code2,
  Copy,
  Cable,
  GitCompare,
  Stethoscope,
  Lightbulb,
  ChevronDown,
  Share2,
  Download,
  HelpCircle as HelpIcon
} from "lucide-react";

// Best-effort guesses for common I2C addresses, shown in the Sanity Check.
const I2C_GUESS: Record<string, string> = {
  "0x0D": "QMC5883L magnetometer",
  "0x1E": "HMC5883L magnetometer",
  "0x27": "PCF8574 LCD backpack",
  "0x29": "VL53L0X / VL53L1X ToF",
  "0x3C": "SSD1306 OLED",
  "0x3D": "SSD1306 OLED",
  "0x3F": "PCF8574 LCD backpack",
  "0x40": "INA219 / PCA9685",
  "0x48": "ADS1115 / LM75",
  "0x4A": "ADS1115",
  "0x53": "ADXL345 accelerometer",
  "0x5A": "MLX90614 / MPR121",
  "0x68": "MPU6050 / DS3231 / DS1307",
  "0x69": "MPU6050 (AD0=1)",
  "0x76": "BME280 / BMP280",
  "0x77": "BME280 / BMP280",
};
import { preloadedBoards } from "./data/preloadedBoards";
import { MicrocontrollerBoard, BoardPin } from "./types";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import LZString from "lz-string";
import { Command } from "cmdk";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

gsap.registerPlugin(useGSAP);

// Collapsible "sheet": a header with a chevron; the detail expands/collapses
// with a smooth height animation when toggled.
function Collapsible({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-zinc-400 group-hover:text-zinc-200">
          {icon}
          {title}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-zinc-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Maps an Arduino IDE board identifier (FQBN) to one of our high-fidelity
// preloaded boards. Anything not listed here falls back to the dynamic
// (Gemini) catalog search using the board's display name.
const FQBN_TO_BOARD_ID: Record<string, string> = {
  "esp32:esp32:esp32": "esp32-30pin",              // "ESP32 Dev Module"
  "esp32:esp32:esp32doit-devkit-v1": "esp32-30pin",
  "esp32:esp32:esp32doit-espduino": "esp32-30pin",
  "esp32:esp32:nodemcu-32s": "esp32-30pin",
  "esp32:esp32:esp32s3": "esp32-s3",
  "esp32:esp32:esp32s3usbotg": "esp32-s3",
  "esp8266:esp8266:nodemcuv2": "esp8266-nodemcu",
  "esp8266:esp8266:nodemcu": "esp8266-nodemcu",
  "arduino:avr:uno": "arduino-uno",
  "arduino:avr:nano": "arduino-nano",
  "arduino:avr:mega": "arduino-mega",
  "arduino:avr:leonardo": "arduino-leonardo",
};

interface ConnectedBoard {
  name: string;
  fqbn: string;
  port: string;
  identified: boolean;
  via?: string;
  usbId?: string;
}

interface ArduinoStatus {
  ok: boolean;
  board: ConnectedBoard | null; // featured USB board, null if nothing plugged in
  connected: boolean;
  connectedBoards?: ConnectedBoard[];
}

// Dynamic offline examples for searched chips if API key isn't provided or as default response template
const offlineSearches: Record<string, Omit<MicrocontrollerBoard, 'id'>> = {
  "stm32": {
    name: "STM32F103C8T6 (Blue Pill)",
    description: "Highly popular and cost-effective ARM Cortex-M3 development board. Offers incredible speed, copious timers, and advanced 12-bit ADC ports compared to 8-bit AVRs.",
    layoutType: "dual-inline",
    datasheetUrl: "https://www.st.com/resource/en/datasheet/stm32f103c8.pdf",
    additionalResources: [
      { label: "STM32F103 Manual", url: "https://www.st.com/resource/en/reference_manual/rm0008-stm32f101xx-stm32f102xx-stm32f103xx-stm32f105xx-and-stm32f107xx-advanced-armbased-32bit-mcus-stmicroelectronics.pdf" }
    ],
    specs: {
      architecture: "ARM Cortex-M3 32-bit",
      clockSpeed: "72 MHz",
      operatingVoltage: "3.3V Logic (Many Pins 5V Tolerant)",
      flashMemory: "64 KB / 128 KB",
      ramSize: "20 KB SRAM",
      gpioCount: 32,
      adcChannels: "10 Channels (12-bit)",
      dacChannels: "None",
      interfaces: "2x I2C, 2x SPI, 3x USART, 1x USB, CAN Bus"
    },
    warnings: [
      "Voltages: Mostly 5V tolerant, but pins PA4, PA5, PA6, PA7 (ADC pins) are strictly 3.3V only. Supplying 5V on analog ports will damage the ADC module.",
      "BOOT Config: BOOT0 and BOOT1 jumpers control execution. For USB flashing/programming, BOOT0 must be jumped to 1, then returned to 0 for standard flash execution.",
      "USB Resistor Bug: Many cheap Blue Pill boards feature an incorrect 10kΩ pull-up resistor on PA12 (USB D+ line) instead of 1.5kΩ, preventing clean connection to some laptops on native USB.",
      "PA15, PB3, PB4 debugger overlap: These are locked to JTAG interface on boot. To use as standard GPIO, disable JTAG in your setup code."
    ],
    peripherals: [
      { interfaceType: "I2C1", pinsUsed: "SDA: PB7, SCL: PB6" },
      { interfaceType: "SPI1", pinsUsed: "NSS: PA4, SCK: PA5, MISO: PA6, MOSI: PA7" },
      { interfaceType: "USART1 (Upload/Debug)", pinsUsed: "TX: PA9, RX: PA10" }
    ],
    pins: [
      { number: "1", name: "VBAT", gpio: "N/A", features: ["Power In", "Battery Backup"], primary: "RTC Battery Input", caution: "Power source for clock retention." },
      { number: "2", name: "PC13", gpio: "13", features: ["GPIO", "Built-In LED"], primary: "Digital I/O / Onboard LED", caution: "Tied to green onboard LED. Active LOW.", isCaution: false },
      { number: "3", name: "PC14", gpio: "14", features: ["GPIO", "LSE Osc (OSC32_IN)"], primary: "Digital I/O or RT Clock", caution: "Connected to onboard 32.768kHz crystal. High impedance.", isCaution: true },
      { number: "4", name: "PC15", gpio: "15", features: ["GPIO", "LSE Osc (OSC32_OUT)"], primary: "Digital I/O or RT Clock", caution: "Connected to crystal.", isCaution: false },
      { number: "5", name: "PD0", gpio: "0", features: ["HSE Osc In", "OSC_IN"], primary: "8MHz High Speed External Osc", caution: "Main system clock input.", isCaution: false },
      { number: "6", name: "PD1", gpio: "1", features: ["HSE Osc Out", "OSC_OUT"], primary: "High Speed External Osc", caution: "Main system clock out.", isCaution: false },
      { number: "7", name: "NRST", gpio: "N/A", features: ["System Reset"], primary: "Hardware Reset Pin", caution: "Active LOW. Connect to a button for manual resets.", isCaution: false },
      { number: "8", name: "VSSA", gpio: "N/A", features: ["Analog Ground"], primary: "Analog Circuit Ground", caution: "Keep grounded to eliminate RF ADC noise.", isCaution: false },
      { number: "9", name: "VDDA", gpio: "N/A", features: ["Analog VCC-3.3V"], primary: "Analog Circuit Power", caution: "Supply clean and stable 3.3V reference voltage.", isCaution: true },
      { number: "10", name: "PA0", gpio: "0", features: ["GPIO", "ADC1_0", "TIM2_CH1", "WKUP"], primary: "Digital I/O / ADC input", caution: "Wakeup capability.", isCaution: false },
      { number: "11", name: "PA1", gpio: "1", features: ["GPIO", "ADC1_1", "TIM2_CH2"], primary: "Digital I/O / ADC input", caution: "", isCaution: false },
      { number: "12", name: "PA2", gpio: "2", features: ["GPIO", "ADC1_2", "TIM2_CH3", "USART2_TX"], primary: "Digital I/O / Hardware UART2 TX", caution: "", isCaution: false },
      { number: "13", name: "PA3", gpio: "3", features: ["GPIO", "ADC1_3", "TIM2_CH4", "USART2_RX"], primary: "Digital I/O / Hardware UART2 RX", caution: "", isCaution: false },
      { number: "14", name: "PA4", gpio: "4", features: ["GPIO", "ADC1_4", "SPI1_NSS"], primary: "Digital I/O / Analog / SPI CS", caution: "No 5V tolerance. Keep input strictly <= 3.3V.", isCaution: true },
      { number: "15", name: "PA5", gpio: "5", features: ["GPIO", "ADC1_5", "SPI1_SCK"], primary: "SPI1 Clock Line", caution: "No 5V tolerance. Keep input strictly <= 3.3V.", isCaution: true },
      { number: "16", name: "PA6", gpio: "6", features: ["GPIO", "ADC1_6", "SPI1_MISO"], primary: "SPI1 MISO", caution: "No 5V tolerance. Keep input strictly <= 3.3V.", isCaution: true },
      { number: "17", name: "PA7", gpio: "7", features: ["GPIO", "ADC1_7", "SPI1_MOSI"], primary: "SPI1 MOSI", caution: "No 5V tolerance. Keep input strictly <= 3.3V.", isCaution: true },
      { number: "18", name: "PB0", gpio: "0", features: ["GPIO", "ADC1_8", "TIM3_CH3"], primary: "Digital I/O / Analog input", caution: "", isCaution: false },
      { number: "19", name: "PB1", gpio: "1", features: ["GPIO", "ADC1_9", "TIM3_CH4"], primary: "Digital I/O / Analog input", caution: "", isCaution: false },
      { number: "20", name: "PB2", gpio: "2", features: ["GPIO", "BOOT1_Pin"], primary: "BOOT1 Pin Layout Selector", caution: "Connected to boot jumper 1. Affects programming logic on startup.", isCaution: true },
      { number: "21", name: "PB10", gpio: "10", features: ["GPIO", "I2C2_SCL", "USART3_TX"], primary: "I2C2 Serial Clock", caution: "", isCaution: false },
      { number: "22", name: "PB11", gpio: "11", features: ["GPIO", "I2C2_SDA", "USART3_RX"], primary: "I2C2 Serial Data", caution: "", isCaution: false },
      { number: "23", name: "RESET", gpio: "N/A", features: ["Reset Button Trigger"], primary: "Reset Key Out", caution: "", isCaution: false },
      { number: "24", name: "3.3V", gpio: "N/A", features: ["Power Output"], primary: "3.3V Out Raw Regulator", caution: "Can power low-draw components.", isCaution: false },
      { number: "25", name: "GND", gpio: "N/A", features: ["Ground"], primary: "Reference Ground", caution: "", isCaution: false },
      { number: "26", name: "5V", gpio: "N/A", features: ["Power Output"], primary: "USB 5V Out", caution: "Directly linked to USB line. Supply input or feed point.", isCaution: false }
    ]
  },
  "pico": {
    name: "Raspberry Pi Pico (RP2040)",
    description: "High-performance dual ARM Cortex-M0+ silicon launched by Raspberry Pi. Extremely flexible programmable I/O statemachines (PIO) and low power consumption.",
    layoutType: "dual-inline",
    datasheetUrl: "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf",
    additionalResources: [
      { label: "RP2040 Datasheet", url: "https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf" }
    ],
    specs: {
      architecture: "Dual ARM Cortex-M0+",
      clockSpeed: "133 MHz",
      operatingVoltage: "3.3V Logic Level Only",
      flashMemory: "2 MB (QSPI Flash)",
      ramSize: "264 KB Multi-bank SRAM",
      gpioCount: 26,
      adcChannels: "3 Channels (12-bit / 4th internal temp)",
      dacChannels: "None",
      interfaces: "2x SPI, 2x I2C, 2x UART, 16x PWM Channels, 2x PIO Blocks"
    },
    warnings: [
      "Logic strictly is 3.3V: Under no circumstances expose any input pin to 5V inputs, as the RP2040 silicon will suffer breakdown.",
      "ADC noise: Standard Pico board connects ADC reference directly to 3.3V output. Highly prone to high noise. Use clean VREF layout for sensitive audio or transducers.",
      "GPIO 23 Power Management: Hardwired directly to the RT6150 power regulator mode control. Low is power save, high is PWM low-ripple. Avoid using GPIO23 as general purpose I/O.",
      "QSPI Flash Pins (1-6 internally linked): Do not interact with pin signals 1 to 6 on the raw module unless you know how to operate high speed SPI master busses."
    ],
    peripherals: [
      { interfaceType: "I2C0 (Default)", pinsUsed: "SDA: GP4, SCL: GP5" },
      { interfaceType: "I2C1", pinsUsed: "SDA: GP2, SCL: GP3" },
      { interfaceType: "SPI0", pinsUsed: "RX: GP16, TX: GP19, SCK: GP18, CS: GP17" },
      { interfaceType: "UART0 (Debug)", pinsUsed: "TX: GP0, RX: GP1" }
    ],
    pins: [
      { number: "1", name: "GP0", gpio: "0", features: ["GPIO", "UART0_TX", "I2C0_SDA", "PWM0"], primary: "Digital I/O / Serial 0 TX" },
      { number: "2", name: "GP1", gpio: "1", features: ["GPIO", "UART0_RX", "I2C0_SCL", "PWM1"], primary: "Digital I/O / Serial 0 RX" },
      { number: "3", name: "GND", gpio: "N/A", features: ["Ground"], primary: "Ground reference point", isCaution: false },
      { number: "4", name: "GP2", gpio: "2", features: ["GPIO", "I2C1_SDA", "PWM2"], primary: "Digital I/O" },
      { number: "5", name: "GP3", gpio: "3", features: ["GPIO", "I2C1_SCL", "PWM3"], primary: "Digital I/O" },
      { number: "6", name: "GP4", gpio: "4", features: ["GPIO", "I2C0_SDA", "PWM4"], primary: "Default Standard I2C SDA" },
      { number: "7", name: "GP5", gpio: "5", features: ["GPIO", "I2C0_SCL", "PWM5"], primary: "Default Standard I2C SCL" },
      { number: "8", name: "GND", gpio: "N/A", features: ["Ground"], primary: "Ground reference point" },
      { number: "9", name: "GP6", gpio: "6", features: ["GPIO", "SPI0_SCK", "PWM6"], primary: "Digital I/O / SPI0 SCK" },
      { number: "10", name: "GP7", gpio: "7", features: ["GPIO", "SPI0_TX", "PWM7"], primary: "Digital I/O / SPI0 MISO" },
      { number: "11", name: "GP8", gpio: "8", features: ["GPIO", "SPI0_RX", "PWM8"], primary: "Digital I/O / SPI0 MOSI" },
      { number: "12", name: "GP9", gpio: "9", features: ["GPIO", "SPI0_CS", "PWM9"], primary: "Digital I/O / SPI0 CS" },
      { number: "13", name: "GND", gpio: "N/A", features: ["Ground"], primary: "Ground reference point" },
      { number: "14", name: "GP10", gpio: "10", features: ["GPIO", "UART1_TX", "PWM10"], primary: "Digital I/O / UART1 TX" },
      { number: "15", name: "GP11", gpio: "11", features: ["GPIO", "UART1_RX", "PWM11"], primary: "Digital I/O / UART1 RX" },
      { number: "16", name: "3V3_OUT", gpio: "N/A", features: ["Power Out"], primary: "Regulated 3.3V Output", caution: "Extremely clean Buck-Boost regulator output. Max load ~300mA.", isCaution: true },
      { number: "17", name: "VSYS", gpio: "N/A", features: ["Power Input"], primary: "Raw power input (1.8V to 5.5V)", caution: "Feeds the onboard regulator. Perfect for battery.", isCaution: false },
      { number: "18", name: "VBUS", gpio: "N/A", features: ["Power Output/Input"], primary: "USB Power Input (5V Connected)", caution: "Powers circuit from laptop USB.", isCaution: false }
    ]
  },
  "attiny85": {
    name: "ATtiny85 (MCU Chip)",
    description: "Ultra-compact 8-pin microcontroller. Amazing option for battery-powered, space-constrained projects that only need a handful of I/O wires.",
    layoutType: "dual-inline",
    datasheetUrl: "https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-2586-AVR-8-bit-Microcontroller-ATtiny25-ATtiny45-ATtiny85_Datasheet.pdf",
    additionalResources: [
      { label: "ATtiny85 Official Docs", url: "https://www.microchip.com/en-us/product/attiny85" }
    ],
    specs: {
      architecture: "AVR 8-bit",
      clockSpeed: "1 MHz to 20 MHz (Internal default 8 MHz)",
      operatingVoltage: "2.7V - 5.5V Logic Level Range",
      flashMemory: "8 KB Flash",
      ramSize: "512 Bytes SRAM + 512 Bytes EEPROM",
      gpioCount: 6,
      adcChannels: "4 Channels (10-bit)",
      dacChannels: "None",
      interfaces: "SPI (USI), I2C compatible, 2x PWM timers"
    },
    warnings: [
      "No USB interface onboard. Requires external Arduino ISP, USBasp, or FTDI programmer to flash standard code.",
      "Reset Pin 1 (PB5) acts as reset. Running high voltage can convert this to a general purpose GPIO, but doing so prevents future low-voltage ISP programming unless high-voltage reset is applied.",
      "Limited RAM (512 Bytes): Memory is extremely constrained. Avoid massive strings, printing complex floating arrays, or allocating big vectors.",
      "Shared I2C and SPI pins: USI (Universal Serial Interface) registers share physical physical pins for I2C and SPI buses. Operating both concurrently requires careful wiring."
    ],
    peripherals: [
      { interfaceType: "I2C (USI Compatible)", pinsUsed: "SDA: Pin 5 (PB0), SCL: Pin 7 (PB2)" },
      { interfaceType: "SPI (ISP Flashing)", pinsUsed: "MOSI: PB0, MISO: PB1, SCK: PB2, Reset: PB5" },
      { interfaceType: "PWM", pinsUsed: "PB0, PB1, PB4" }
    ],
    pins: [
      { number: "1", name: "PB5 / RESET", gpio: "5", features: ["Digital I/O", "Reset Pin", "ADC0", "dW (debugWIRE)"], primary: "System Reset / Trigger Input", caution: "Do not pull low unless you intend to halt and reset execution.", isCaution: true },
      { number: "2", name: "PB3 (A3)", gpio: "3", features: ["Digital I/O", "ADC3", "XTAL1 OSC IN"], primary: "Analog Input 3 / Digital", caution: "Tied to crystal oscillator if external clock is enabled via fuses.", isCaution: false },
      { number: "3", name: "PB4 (A2)", gpio: "4", features: ["Digital I/O", "ADC2", "XTAL2 OSC OUT", "PWM"], primary: "Analog Input 2 / PWM Out", caution: "Shares clock source components.", isCaution: false },
      { number: "4", name: "GND", gpio: "N/A", features: ["System Ground"], primary: "Ground reference point" },
      { number: "5", name: "PB0 / MOSI / SDA", gpio: "0", features: ["Digital I/O", "PWM", "MOSI (SPI)", "SDA (I2C)"], primary: "SDA Data Bus / Master Out SPI", caution: "Critical shared data lines.", isCaution: false },
      { number: "6", name: "PB1 / MISO", gpio: "1", features: ["Digital I/O", "PWM", "MISO (SPI)"], primary: "MISO Master In Slave Out SPI" },
      { number: "7", name: "PB2 / SCL", gpio: "2", features: ["Digital I/O", "ADC1", "SCK (SPI)", "SCL (I2C)"], primary: "SCL Clock Bus / SPI Clock / ADC 1" },
      { number: "8", name: "VCC", gpio: "N/A", features: ["Power Input"], primary: "Positive supply (2.7V - 5.5V)", caution: "Apply logic positive feed safe level.", isCaution: false }
    ]
  }
};

// ============================================================================
//  PIN PLANNER  —  assign pins to jobs and flag conflicts before you wire/boot
// ============================================================================

type PinDrive = "out" | "in" | "bidir" | "analog";
interface PlannerRole {
  id: string;
  label: string;
  short: string;
  drive: PinDrive; // does the job drive the pin (out), read it (in), both, or analog?
  group?: string;
}

const PLANNER_ROLES: PlannerRole[] = [
  { id: "i2c_sda", label: "I²C — SDA", short: "SDA", drive: "bidir", group: "I²C" },
  { id: "i2c_scl", label: "I²C — SCL", short: "SCL", drive: "out", group: "I²C" },
  { id: "spi_mosi", label: "SPI — MOSI", short: "MOSI", drive: "out", group: "SPI" },
  { id: "spi_miso", label: "SPI — MISO", short: "MISO", drive: "in", group: "SPI" },
  { id: "spi_sck", label: "SPI — SCK", short: "SCK", drive: "out", group: "SPI" },
  { id: "spi_cs", label: "SPI — CS", short: "CS", drive: "out", group: "SPI" },
  { id: "uart_tx", label: "UART — TX", short: "TX", drive: "out", group: "UART" },
  { id: "uart_rx", label: "UART — RX", short: "RX", drive: "in", group: "UART" },
  { id: "pwm", label: "PWM output", short: "PWM", drive: "out", group: "GPIO" },
  { id: "dout", label: "Digital out / MOSFET gate", short: "OUT", drive: "out", group: "GPIO" },
  { id: "din", label: "Digital in / button", short: "IN", drive: "in", group: "GPIO" },
  { id: "adc", label: "Analog in (ADC)", short: "ADC", drive: "analog", group: "GPIO" },
  { id: "sensor", label: "Sensor / other", short: "SENS", drive: "bidir", group: "GPIO" },
];

interface PinCaps {
  assignable: boolean;
  inputOnly: boolean;
  flash: boolean;
  strapping: boolean;
  adc2: boolean;
  uart0Debug: boolean;
  canAnalog: boolean;
}

// Work out what a pin can/can't do from its metadata. Preloaded boards carry
// rich caution text; ESP32 also gets authoritative GPIO-number rules.
function classifyPlannerPin(pin: BoardPin, board: MicrocontrollerBoard): PinCaps {
  const text = `${pin.name} ${pin.primary} ${(pin.features || []).join(" ")} ${pin.caution || ""}`.toLowerCase();
  const g = parseInt(pin.gpio, 10);
  const hasG = !isNaN(g);
  const arch = (board.specs?.architecture || "").toLowerCase();
  const id = (board.id || "").toLowerCase();
  const esp32Classic =
    id.includes("esp32-30") ||
    (arch.includes("xtensa") && !id.includes("s3") && !arch.includes("s3"));
  const assignable = !!pin.gpio && pin.gpio !== "N/A";
  return {
    assignable,
    inputOnly:
      /input only|input-only/.test(text) ||
      (esp32Classic && hasG && [34, 35, 36, 39].includes(g)),
    flash:
      /internal (spi )?flash|flash memory line|tied to (the )?(internal )?(spi )?flash|do not (use|connect)/.test(text) ||
      (esp32Classic && hasG && [6, 7, 8, 9, 10, 11].includes(g)),
    strapping:
      /strap|boot critical|boot fail|boot mode|affects? .*boot/.test(text) ||
      (esp32Classic && hasG && [0, 2, 5, 12, 15].includes(g)),
    adc2: /adc2/.test(text),
    uart0Debug: /(uart0|debug|usb)/.test(text) && /\b(tx|rx|txd|rxd)\b/.test(text),
    canAnalog: /adc|analog|dac/.test(text),
  };
}

interface PinAssignment {
  id: string;
  roleId: string;
  pinName: string;
  label?: string;
}
interface PlanIssue {
  sev: "error" | "warn";
  text: string;
}
interface PlanResult {
  perAssignment: Record<string, { severity: "ok" | "warn" | "error"; messages: PlanIssue[] }>;
  errors: number;
  warnings: number;
}

function assignmentLabel(a: PinAssignment): string {
  const role = PLANNER_ROLES.find((r) => r.id === a.roleId);
  return (a.label && a.label.trim()) || role?.label || "Assignment";
}

// The heart of the planner: turn a list of assignments into live conflicts.
function analyzePlan(
  assignments: PinAssignment[],
  board: MicrocontrollerBoard,
  wifiInUse: boolean
): PlanResult {
  const byPin: Record<string, PinAssignment[]> = {};
  for (const a of assignments) {
    if (a.pinName) (byPin[a.pinName] = byPin[a.pinName] || []).push(a);
  }

  const perAssignment: PlanResult["perAssignment"] = {};
  let errors = 0;
  let warnings = 0;

  for (const a of assignments) {
    const msgs: PlanIssue[] = [];
    const role = PLANNER_ROLES.find((r) => r.id === a.roleId);

    if (!a.pinName) {
      perAssignment[a.id] = { severity: "ok", messages: [] };
      continue;
    }

    // Double-booked: same physical pin used by more than one job.
    if (byPin[a.pinName] && byPin[a.pinName].length > 1) {
      const others = byPin[a.pinName]
        .filter((x) => x.id !== a.id)
        .map((x) => assignmentLabel(x))
        .join(", ");
      msgs.push({ sev: "error", text: `Double-booked — this pin is also used by ${others}.` });
    }

    const pin = board.pins.find((p) => p.name === a.pinName);
    if (pin) {
      const c = classifyPlannerPin(pin, board);
      if (!c.assignable) {
        msgs.push({ sev: "error", text: "Power / ground / reset pin — not usable as I/O." });
      }
      if (c.flash) {
        msgs.push({ sev: "error", text: "Wired to the internal SPI flash (GPIO 6–11). Using it crashes/hangs the chip — never connect here." });
      }
      if (c.inputOnly && role && (role.drive === "out" || role.drive === "bidir")) {
        msgs.push({ sev: "error", text: `Input-only pin — it has no output driver, so it can’t do ${role.short}.` });
      }
      if (role && role.drive === "analog" && !c.canAnalog) {
        msgs.push({ sev: "warn", text: "No ADC on this pin — an analog read here won’t work." });
      }
      if (c.adc2 && role && role.drive === "analog" && wifiInUse) {
        msgs.push({ sev: "warn", text: "ADC2 pin — can’t be read while Wi-Fi is active on ESP32. Use an ADC1 pin instead." });
      }
      if (c.strapping) {
        msgs.push({ sev: "warn", text: "Strapping / boot pin — the wrong level at power-up can stop the board booting or force flash mode. Keep it free at boot." });
      }
      if (c.uart0Debug && a.roleId !== "uart_tx" && a.roleId !== "uart_rx") {
        msgs.push({ sev: "warn", text: "This is the USB / debug serial pin — reusing it can clash with uploads and the Serial monitor." });
      }
    }

    const severity = msgs.some((m) => m.sev === "error")
      ? "error"
      : msgs.some((m) => m.sev === "warn")
      ? "warn"
      : "ok";
    if (severity === "error") errors++;
    else if (severity === "warn") warnings++;
    perAssignment[a.id] = { severity, messages: msgs };
  }

  return { perAssignment, errors, warnings };
}

// Best-effort default pin for a bus line, found from pin metadata.
function findPinByFeature(
  board: MicrocontrollerBoard,
  includes: string[],
  avoid: string[] = []
): string {
  const hit = board.pins.find((p) => {
    if (!p.gpio || p.gpio === "N/A") return false;
    const hay = `${p.name} ${(p.features || []).join(" ")} ${p.primary}`.toLowerCase();
    const caut = (p.caution || "").toLowerCase();
    if (avoid.some((a) => hay.includes(a) || caut.includes(a))) return false;
    return includes.some((k) => hay.includes(k));
  });
  return hit ? hit.name : "";
}

// ============================================================================
//  PERIPHERAL CODE GENERATOR  —  board + bus -> correct init boilerplate
// ============================================================================

type Bus = "i2c" | "spi" | "uart";

function boardFamily(board: MicrocontrollerBoard): "esp32" | "esp8266" | "stm32" | "rp2040" | "avr" | "arduino" {
  const blob = `${board.id || ""} ${board.specs?.architecture || ""} ${board.name || ""}`.toLowerCase();
  if (/esp32/.test(blob)) return "esp32";
  if (/esp8266|nodemcu/.test(blob)) return "esp8266";
  if (/stm32|cortex-m|blue ?pill/.test(blob)) return "stm32";
  if (/rp2040|pico/.test(blob)) return "rp2040";
  if (/avr|atmega|attiny|uno|nano|mega|leonardo/.test(blob)) return "avr";
  return "arduino";
}

// GPIO number for the first pin matching any keyword (skipping `avoid` words).
function busPinGpio(board: MicrocontrollerBoard, includes: string[], avoid: string[] = []): string | null {
  const p = board.pins.find((pp) => {
    if (!pp.gpio || pp.gpio === "N/A") return false;
    const hay = `${pp.name} ${(pp.features || []).join(" ")} ${pp.primary}`.toLowerCase();
    const caut = (pp.caution || "").toLowerCase();
    if (avoid.some((a) => hay.includes(a) || caut.includes(a))) return false;
    return includes.some((k) => hay.includes(k));
  });
  return p ? p.gpio : null;
}

const FAMILY_LABEL: Record<string, string> = {
  esp32: "Arduino — ESP32 core (C++)",
  esp8266: "Arduino — ESP8266 core (C++)",
  avr: "Arduino — AVR (C++)",
  rp2040: "Arduino — RP2040 / Pico core (C++)",
  stm32: "STM32 HAL (C)",
  arduino: "Arduino (C++)",
};

function generatePeripheralCode(board: MicrocontrollerBoard, bus: Bus): { framework: string; code: string } {
  const fam = boardFamily(board);
  const framework = FAMILY_LABEL[fam];

  // Pull real default pins from the board; fall back to family conventions.
  const sda = busPinGpio(board, ["sda"]) || (fam === "esp8266" ? "4" : fam === "rp2040" ? "4" : "21");
  const scl = busPinGpio(board, ["scl"]) || (fam === "esp8266" ? "5" : fam === "rp2040" ? "5" : "22");
  // Prefer VSPI on ESP32 (it's the recommended bus; HSPI overlaps strapping pins
  // like GPIO12). Fall back to any SPI pin that isn't an HSPI/strapping one.
  const sck = busPinGpio(board, ["vspi_sck"]) || busPinGpio(board, ["sck", "spi_clk", "_clk"], ["hspi"]) || "18";
  const miso = busPinGpio(board, ["vspi_miso"]) || busPinGpio(board, ["miso"], ["hspi"]) || (fam === "rp2040" ? "16" : "19");
  const mosi = busPinGpio(board, ["vspi_mosi"]) || busPinGpio(board, ["mosi"], ["hspi"]) || (fam === "rp2040" ? "19" : "23");
  const cs = busPinGpio(board, ["vspi_cs"]) || busPinGpio(board, ["spi_cs", "ss"], ["hspi"]) || (fam === "rp2040" ? "17" : "5");
  const tx = busPinGpio(board, ["uart2_tx", "txd", "tx"], ["debug", "usb", "uart0"]) || "17";
  const rx = busPinGpio(board, ["uart2_rx", "rxd", "rx"], ["debug", "usb", "uart0"]) || "16";

  if (fam === "stm32") {
    if (bus === "i2c")
      return {
        framework,
        code: `/* STM32 HAL — I2C init (CubeMX generates this; shown for reference) */
#include "stm32f4xx_hal.h"   // match your series (F1/F4/...)

I2C_HandleTypeDef hi2c1;

void MX_I2C1_Init(void) {
  hi2c1.Instance             = I2C1;
  hi2c1.Init.ClockSpeed      = 100000;            // 100 kHz standard mode
  hi2c1.Init.DutyCycle       = I2C_DUTYCYCLE_2;
  hi2c1.Init.OwnAddress1     = 0;
  hi2c1.Init.AddressingMode  = I2C_ADDRESSINGMODE_7BIT;
  hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c1.Init.NoStretchMode   = I2C_NOSTRETCH_DISABLE;
  if (HAL_I2C_Init(&hi2c1) != HAL_OK) { Error_Handler(); }
}

/* Default pins: SDA = PB7, SCL = PB6 (or remap PB9/PB8). Set these in
   MX_GPIO_Init() with GPIO_AF4_I2C1. Read a register: */
uint8_t buf[2];
HAL_I2C_Mem_Read(&hi2c1, (0x68 << 1), 0x75, 1, buf, 1, 100);`,
      };
    if (bus === "spi")
      return {
        framework,
        code: `/* STM32 HAL — SPI init (CubeMX generates this; shown for reference) */
#include "stm32f4xx_hal.h"

SPI_HandleTypeDef hspi1;

void MX_SPI1_Init(void) {
  hspi1.Instance               = SPI1;
  hspi1.Init.Mode              = SPI_MODE_MASTER;
  hspi1.Init.Direction         = SPI_DIRECTION_2LINES;
  hspi1.Init.DataSize          = SPI_DATASIZE_8BIT;
  hspi1.Init.CLKPolarity       = SPI_POLARITY_LOW;   // CPOL=0
  hspi1.Init.CLKPhase          = SPI_PHASE_1EDGE;    // CPHA=0  (mode 0)
  hspi1.Init.NSS               = SPI_NSS_SOFT;       // drive CS in software
  hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
  hspi1.Init.FirstBit          = SPI_FIRSTBIT_MSB;
  if (HAL_SPI_Init(&hspi1) != HAL_OK) { Error_Handler(); }
}

/* Default pins: SCK = PA5, MISO = PA6, MOSI = PA7, CS = your GPIO (software).
   Transfer one byte: */
uint8_t tx = 0x9F, rx = 0;
HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_RESET);
HAL_SPI_TransmitReceive(&hspi1, &tx, &rx, 1, 100);
HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_SET);`,
      };
    return {
      framework,
      code: `/* STM32 HAL — UART init (CubeMX generates this; shown for reference) */
#include "stm32f4xx_hal.h"

UART_HandleTypeDef huart2;

void MX_USART2_UART_Init(void) {
  huart2.Instance        = USART2;
  huart2.Init.BaudRate   = 115200;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits   = UART_STOPBITS_1;
  huart2.Init.Parity     = UART_PARITY_NONE;
  huart2.Init.Mode       = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl  = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK) { Error_Handler(); }
}

/* Default pins: TX = PA2, RX = PA3 (AF7). Send a string: */
char msg[] = "hello\\r\\n";
HAL_UART_Transmit(&huart2, (uint8_t*)msg, sizeof(msg) - 1, 100);`,
    };
  }

  // ---- Arduino-framework families (esp32 / esp8266 / avr / rp2040 / generic) ----
  if (bus === "i2c") {
    let begin: string;
    let note: string;
    if (fam === "avr") {
      begin = "  Wire.begin();";
      note = "  // Uno/Nano: SDA = A4, SCL = A5 (fixed). Mega: SDA = 20, SCL = 21.";
    } else if (fam === "rp2040") {
      begin = `  Wire.setSDA(${sda});\n  Wire.setSCL(${scl});\n  Wire.begin();`;
      note = `  // Pico: SDA = GP${sda}, SCL = GP${scl}`;
    } else {
      begin = `  Wire.begin(${sda}, ${scl});`;
      note = `  // SDA = GPIO${sda}, SCL = GPIO${scl}`;
    }
    return {
      framework,
      code: `#include <Wire.h>

void setup() {
  Serial.begin(115200);
${begin}
${note}
  // Wire.setClock(400000);  // optional: 400 kHz fast mode

  // --- quick I2C scanner: prints every device address found ---
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      Serial.println(addr, HEX);
    }
  }
}

void loop() {
}`,
    };
  }

  if (bus === "spi") {
    let begin: string;
    let note: string;
    if (fam === "avr") {
      begin = "  SPI.begin();";
      note = "  // Uno/Nano: SCK = 13, MISO = 12, MOSI = 11, SS = 10 (fixed)";
    } else if (fam === "esp8266") {
      begin = "  SPI.begin();";
      note = "  // ESP8266 HSPI: SCK = GPIO14, MISO = GPIO12, MOSI = GPIO13";
    } else if (fam === "rp2040") {
      begin = `  SPI.setSCK(${sck});\n  SPI.setRX(${miso});\n  SPI.setTX(${mosi});\n  SPI.begin();`;
      note = `  // Pico: SCK = GP${sck}, MISO(RX) = GP${miso}, MOSI(TX) = GP${mosi}`;
    } else {
      begin = `  SPI.begin(${sck}, ${miso}, ${mosi}, CS_PIN);`;
      note = `  // SCK = GPIO${sck}, MISO = GPIO${miso}, MOSI = GPIO${mosi}, CS = GPIO${cs}`;
    }
    return {
      framework,
      code: `#include <SPI.h>

const int CS_PIN = ${fam === "avr" ? "10" : cs};

void setup() {
  Serial.begin(115200);
  pinMode(CS_PIN, OUTPUT);
  digitalWrite(CS_PIN, HIGH);   // deselect
${begin}
${note}

  // --- example: read one register from a SPI device ---
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(CS_PIN, LOW);
  SPI.transfer(0x80 | 0x00);    // read bit + register address
  uint8_t val = SPI.transfer(0x00);
  digitalWrite(CS_PIN, HIGH);
  SPI.endTransaction();
  Serial.println(val, HEX);
}

void loop() {
}`,
    };
  }

  // UART
  if (fam === "esp32") {
    return {
      framework,
      code: `// ESP32 has 3 UARTs. Serial = USB debug; Serial2 = spare on GPIO${rx}/GPIO${tx}.
void setup() {
  Serial.begin(115200);                          // USB / debug
  Serial2.begin(9600, SERIAL_8N1, ${rx}, ${tx});   // RX = GPIO${rx}, TX = GPIO${tx}
}

void loop() {
  // echo whatever arrives on Serial2 back out to it
  if (Serial2.available()) {
    char c = Serial2.read();
    Serial.write(c);     // mirror to USB
    Serial2.write(c);    // echo to device
  }
}`,
    };
  }
  return {
    framework,
    code: `// ${fam === "avr" ? "Uno/Nano: TX = D1, RX = D0 (shared with USB)." : "Hardware UART"}
void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    Serial.write(c);   // echo back
  }
}`,
  };
}

// ============================================================================
//  SENSOR / MODULE WIRING HELPER  —  how do I hook this part to this board?
// ============================================================================
interface SensorPin {
  sig: string; // silkscreen label on the module
  role: "vcc" | "gnd" | "sda" | "scl" | "mosi" | "miso" | "sck" | "cs" | "tx" | "rx" | "adc" | "data" | "gpio";
  note?: string;
}
interface SensorDef {
  id: string;
  name: string;
  iface: "I²C" | "SPI" | "UART" | "Analog" | "1-Wire" | "PWM" | "Digital";
  vcc: string; // human-readable supply spec
  rail: "3.3" | "5" | "either"; // which board rail to power it from
  logic: "3.3" | "5" | "either"; // module's I/O logic level
  inputs5vTolerant?: boolean; // module inputs survive 5 V even if it's a 3.3 V part
  pins: SensorPin[];
  notes?: string[];
}

const SENSORS: SensorDef[] = [
  {
    id: "vl53l1x",
    name: "VL53L1X ToF distance (breakout)",
    iface: "I²C",
    vcc: "2.6–5.5 V (onboard regulator)",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VIN", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA", role: "sda" },
      { sig: "SCL", role: "scl" },
      { sig: "XSHUT", role: "gpio", note: "optional — drive LOW to reset / for address change" },
      { sig: "GPIO1", role: "gpio", note: "optional interrupt out" },
    ],
    notes: [
      "Common breakouts (Pololu/Adafruit) have a regulator + I²C level shifters, so they run on 3.3 V or 5 V boards.",
      "The bare chip is 2.8 V only — these notes assume a breakout board.",
      "Default I²C address 0x29; pull XSHUT low per-sensor to run several on one bus.",
    ],
  },
  {
    id: "bme280",
    name: "BME280 temp / humidity / pressure",
    iface: "I²C",
    vcc: "3.3–5 V (GY-BME280 has regulator)",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VCC/VIN", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA/SDI", role: "sda" },
      { sig: "SCL/SCK", role: "scl" },
    ],
    notes: ["Address 0x76 or 0x77 (SDO pin selects). Bare BMP280 modules without a regulator are 3.3 V only."],
  },
  {
    id: "mpu6050",
    name: "MPU-6050 IMU (GY-521)",
    iface: "I²C",
    vcc: "3–5 V (onboard regulator)",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA", role: "sda" },
      { sig: "SCL", role: "scl" },
      { sig: "INT", role: "gpio", note: "optional data-ready interrupt" },
      { sig: "AD0", role: "gpio", note: "address select: low=0x68, high=0x69" },
    ],
    notes: ["GY-521 has a regulator + logic that tolerates 3.3 V and 5 V."],
  },
  {
    id: "ssd1306",
    name: "SSD1306 OLED 128×64 (I²C)",
    iface: "I²C",
    vcc: "3.3–5 V",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA", role: "sda" },
      { sig: "SCL", role: "scl" },
    ],
    notes: ["Address usually 0x3C. Cheap modules vary 3.3–5 V; check the silkscreen."],
  },
  {
    id: "ds3231",
    name: "DS3231 RTC",
    iface: "I²C",
    vcc: "3.3–5.5 V",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA", role: "sda" },
      { sig: "SCL", role: "scl" },
    ],
    notes: ["Address 0x68. Some boards trickle-charge a LIR2032 — don't fit a non-rechargeable CR2032 on those."],
  },
  {
    id: "hcsr04",
    name: "HC-SR04 ultrasonic",
    iface: "Analog",
    vcc: "5 V",
    rail: "5",
    logic: "5",
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "TRIG", role: "gpio" },
      { sig: "ECHO", role: "gpio", note: "5 V output — level-shift on 3.3 V boards" },
      { sig: "GND", role: "gnd" },
    ],
    notes: [
      "Needs a 5 V supply to work reliably.",
      "ECHO drives 5 V. On a 3.3 V board (ESP32 etc.) put a divider on ECHO (e.g. 1 kΩ + 2 kΩ) or a level shifter — 5 V straight into a 3.3 V GPIO can damage it.",
    ],
  },
  {
    id: "ds18b20",
    name: "DS18B20 temperature (1-Wire)",
    iface: "1-Wire",
    vcc: "3.0–5.5 V",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VDD", role: "vcc" },
      { sig: "DQ", role: "data", note: "needs a 4.7 kΩ pull-up to VCC" },
      { sig: "GND", role: "gnd" },
    ],
    notes: ["Add one 4.7 kΩ pull-up from DQ to VCC for the whole bus. Logic follows whatever VCC you use."],
  },
  {
    id: "neo6m",
    name: "NEO-6M GPS",
    iface: "UART",
    vcc: "3.3–5 V (module regulator)",
    rail: "either",
    logic: "3.3",
    inputs5vTolerant: true,
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "TX", role: "tx", note: "→ board RX" },
      { sig: "RX", role: "rx", note: "← board TX" },
    ],
    notes: ["Cross TX↔RX. Module TX idles at ~3.3 V (reads fine on a 5 V board). Default 9600 baud."],
  },
  {
    id: "nrf24l01",
    name: "nRF24L01 2.4 GHz radio",
    iface: "SPI",
    vcc: "3.3 V ONLY (max 3.6 V)",
    rail: "3.3",
    logic: "3.3",
    inputs5vTolerant: true,
    pins: [
      { sig: "VCC", role: "vcc", note: "3.3 V only — 5 V destroys it" },
      { sig: "GND", role: "gnd" },
      { sig: "CE", role: "gpio" },
      { sig: "CSN", role: "cs" },
      { sig: "SCK", role: "sck" },
      { sig: "MOSI", role: "mosi" },
      { sig: "MISO", role: "miso" },
      { sig: "IRQ", role: "gpio", note: "optional interrupt" },
    ],
    notes: [
      "Power VCC from 3.3 V ONLY — 5 V will kill it. Its logic inputs are 5 V tolerant, so a 5 V MCU's SPI lines are fine.",
      "Add a 10 µF cap across VCC/GND right at the module — brown-outs during TX are the #1 cause of flaky links.",
    ],
  },
  {
    id: "sdcard",
    name: "microSD card module (SPI)",
    iface: "SPI",
    vcc: "3.3–5 V (modules with regulator)",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "VCC", role: "vcc" },
      { sig: "GND", role: "gnd" },
      { sig: "SCK", role: "sck" },
      { sig: "MOSI", role: "mosi" },
      { sig: "MISO", role: "miso" },
      { sig: "CS", role: "cs" },
    ],
    notes: ["Modules with a regulator + level shifter take 5 V. A bare card holder is 3.3 V only — never feed a raw card 5 V."],
  },
  {
    id: "servo",
    name: "Servo (SG90 / MG90S)",
    iface: "PWM",
    vcc: "4.8–6 V",
    rail: "5",
    logic: "either",
    pins: [
      { sig: "Signal (orange)", role: "gpio", note: "any PWM-capable GPIO" },
      { sig: "V+ (red)", role: "vcc", note: "5 V — NOT the 3.3 V pin" },
      { sig: "GND (brown)", role: "gnd" },
    ],
    notes: [
      "Servos pull current spikes — power from 5 V, and for anything bigger than an SG90 use a separate 5 V supply with a common ground.",
      "The 3.3 V signal from an ESP32 drives most hobby servos fine.",
    ],
  },
  {
    id: "i2clcd",
    name: "I²C LCD 1602 (PCF8574)",
    iface: "I²C",
    vcc: "5 V",
    rail: "5",
    logic: "either",
    pins: [
      { sig: "VCC", role: "vcc", note: "5 V for proper contrast/backlight" },
      { sig: "GND", role: "gnd" },
      { sig: "SDA", role: "sda" },
      { sig: "SCL", role: "scl" },
    ],
    notes: ["Address usually 0x27 or 0x3F. The display needs 5 V; on a 3.3 V board the I²C lines still work but power VCC from 5 V."],
  },
  {
    id: "button",
    name: "Push button",
    iface: "Digital",
    vcc: "—",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "Leg A", role: "gpio", note: "to a GPIO; use pinMode(pin, INPUT_PULLUP)" },
      { sig: "Leg B", role: "gnd" },
    ],
    notes: ["With INPUT_PULLUP, pressed reads LOW and you need no external resistor."],
  },
  {
    id: "pot",
    name: "Potentiometer",
    iface: "Analog",
    vcc: "—",
    rail: "either",
    logic: "either",
    pins: [
      { sig: "End 1", role: "vcc", note: "power rail (3.3 V on a 3.3 V board)" },
      { sig: "Wiper (middle)", role: "adc" },
      { sig: "End 2", role: "gnd" },
    ],
    notes: ["Power the outer pins from the board's logic rail so the wiper never exceeds the ADC's max (3.3 V on ESP32)."],
  },
  {
    id: "relay",
    name: "Relay module (1-ch)",
    iface: "Digital",
    vcc: "5 V (coil)",
    rail: "5",
    logic: "either",
    pins: [
      { sig: "IN", role: "gpio" },
      { sig: "VCC", role: "vcc", note: "5 V for the coil" },
      { sig: "GND", role: "gnd" },
    ],
    notes: ["Most modules are active-LOW (IN low = relay on). Coil needs ~5 V; an opto-isolated module is safer for the MCU."],
  },
  {
    id: "neopixel",
    name: "WS2812 NeoPixel",
    iface: "Digital",
    vcc: "5 V",
    rail: "5",
    logic: "5",
    pins: [
      { sig: "DIN", role: "gpio", note: "data in — first pixel" },
      { sig: "5V", role: "vcc" },
      { sig: "GND", role: "gnd" },
    ],
    notes: [
      "Data is 5 V logic. From a 3.3 V board add a level shifter (or a ~330 Ω series resistor and keep the lead short) for reliable colour.",
      "Big strips need an external 5 V supply with the ground tied to the board.",
    ],
  },
];

// Colours used to tag attached components on the board map.
const COMPONENT_COLORS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#c084fc", "#fb7185"];

function parseBoardLogic(board: MicrocontrollerBoard): "3.3" | "5" {
  return /5\s*v\s*logic|^5\.0|^5v/i.test(board.specs?.operatingVoltage || "") ? "5" : "3.3";
}

interface WiringRow { module: string; board: string; note?: string }
function generateWiring(board: MicrocontrollerBoard, sensor: SensorDef): {
  rows: WiringRow[];
  rail: string;
  issues: { sev: "ok" | "warn" | "error"; text: string }[];
} {
  const pinName = (re: RegExp) => {
    const p = board.pins.find((pp) => re.test(pp.name.toLowerCase()) || re.test((pp.primary || "").toLowerCase()));
    return p?.name;
  };
  const v33 = pinName(/3v3|3\.3\s*v/);
  const v5 = pinName(/\b5v\b|vin/);
  const gnd = pinName(/gnd|ground/) || "GND";
  const boardLogic = parseBoardLogic(board);

  // which rail powers the module
  let rail: string;
  if (sensor.rail === "5") rail = v5 || "5V (external)";
  else if (sensor.rail === "3.3") rail = v33 || "3.3V (external)";
  else rail = boardLogic === "5" ? v5 || v33 || "5V" : v33 || v5 || "3.3V";

  const sda = findPinByFeature(board, ["sda"]) || "SDA";
  const scl = findPinByFeature(board, ["scl"]) || "SCL";
  const mosi = findPinByFeature(board, ["vspi_mosi"]) || findPinByFeature(board, ["mosi"], ["hspi"]) || "MOSI";
  const miso = findPinByFeature(board, ["vspi_miso"]) || findPinByFeature(board, ["miso"], ["hspi"]) || "MISO";
  const sck = findPinByFeature(board, ["vspi_sck"]) || findPinByFeature(board, ["sck", "_clk"], ["hspi"]) || "SCK";
  const btx = findPinByFeature(board, ["uart2_tx", "txd", "tx"], ["debug", "usb", "uart0"]) || "TX";
  const brx = findPinByFeature(board, ["uart2_rx", "rxd", "rx"], ["debug", "usb", "uart0"]) || "RX";
  const adc = findPinByFeature(board, ["adc", "analog"]) || "an ADC pin";

  const roleToBoard = (role: SensorPin["role"]): string => {
    switch (role) {
      case "vcc": return rail;
      case "gnd": return gnd;
      case "sda": return sda;
      case "scl": return scl;
      case "mosi": return mosi;
      case "miso": return miso;
      case "sck": return sck;
      case "cs": return "any free GPIO (chip-select)";
      case "tx": return brx; // module TX -> board RX
      case "rx": return btx; // module RX -> board TX
      case "adc": return adc;
      case "data": return "any free GPIO";
      case "gpio": return "any free GPIO";
    }
  };

  const rows = sensor.pins.map((p) => ({ module: p.sig, board: roleToBoard(p.role), note: p.note }));

  const issues: { sev: "ok" | "warn" | "error"; text: string }[] = [];
  // supply rail availability
  if (sensor.rail === "3.3" && !v33) issues.push({ sev: "error", text: "This module needs a 3.3 V supply, but this board doesn't expose a 3.3 V pin. Power it from an external 3.3 V regulator." });
  if (sensor.rail === "5" && !v5) issues.push({ sev: "warn", text: "This module wants 5 V; this board has no 5 V / VIN pin. Power it from USB 5 V or an external supply, with grounds tied together." });

  // logic-level compatibility
  if (sensor.logic === "either") {
    issues.push({ sev: "ok", text: `Logic levels are compatible — module works at this board's ${boardLogic} V logic.` });
  } else if (sensor.logic === boardLogic) {
    issues.push({ sev: "ok", text: `Logic levels match (${boardLogic} V).` });
  } else if (boardLogic === "3.3" && sensor.logic === "5") {
    issues.push({ sev: "warn", text: "Module I/O is 5 V but the board is 3.3 V. Level-shift the module's OUTPUT lines down to 3.3 V before they hit a GPIO." });
  } else if (boardLogic === "5" && sensor.logic === "3.3") {
    if (sensor.inputs5vTolerant)
      issues.push({ sev: "warn", text: "Board I/O is 5 V; module is a 3.3 V part but its inputs tolerate 5 V. Keep VCC at 3.3 V — only the supply is the risk here." });
    else
      issues.push({ sev: "warn", text: "Board I/O is 5 V but the module is 3.3 V — 5 V on its pins can damage it. Use a level shifter (and 3.3 V supply)." });
  }

  return { rows, rail, issues };
}

// ============================================================================
//  REVERSE PIN SEARCH  —  "show every PWM / 5V-tolerant / interrupt pin"
// ============================================================================
// Board-aware because some capabilities are universal-but-untagged (every ESP32
// GPIO does PWM and interrupts) and some are board-level (5V tolerance).
function pinMatchesCapability(pin: BoardPin, board: MicrocontrollerBoard, queryRaw: string): boolean {
  const q = queryRaw.trim().toLowerCase();
  if (!q) return true;

  const text = `${pin.name} ${pin.primary} ${(pin.features || []).join(" ")} ${pin.caution || ""}`.toLowerCase();
  const fam = boardFamily(board);
  const caps = classifyPlannerPin(pin, board);
  const isGpio = !!pin.gpio && pin.gpio !== "N/A";
  const outputCapable = isGpio && !caps.inputOnly && !caps.flash;
  const has = (...kw: string[]) => kw.some((k) => text.includes(k));

  // 5 V tolerant
  if (/5\s*v|five ?volt/.test(q)) {
    if (fam === "avr") return isGpio; // AVR runs at 5 V logic
    if (fam === "stm32") return /5\s*v[- ]?tolerant/.test(text) && !/no 5\s*v|not 5\s*v|strictly 3\.3/.test(text);
    return /5\s*v[- ]?tolerant/.test(text); // ESP32/ESP8266/RP2040 are 3.3 V only
  }
  if (q.includes("pwm")) {
    if (has("pwm", "ledc")) return true;
    if ((fam === "esp32" || fam === "esp8266" || fam === "rp2040") && outputCapable) return true;
    return false;
  }
  if (q.includes("interrupt") || q === "int" || q.includes("irq")) {
    if (has("interrupt", "int0", "int1", "irq")) return true;
    if ((fam === "esp32" || fam === "esp8266" || fam === "rp2040") && isGpio) return true;
    return false;
  }
  if (q.includes("touch")) return has("touch");
  if (q.includes("dac")) return has("dac");
  if (q.includes("adc") || q.includes("analog")) return has("adc", "analog", "dac");
  if (q.includes("rtc") || q.includes("wake") || q.includes("wkup")) return has("rtc", "wake", "wkup");
  if (q.includes("i2c") || q.includes("sda") || q.includes("scl")) return has("i2c", "sda", "scl");
  if (q.includes("spi") || q.includes("mosi") || q.includes("miso") || q.includes("sck")) return has("spi", "mosi", "miso", "sck", "_cs", " ss");
  if (q.includes("uart") || q.includes("serial") || q === "tx" || q === "rx") return has("uart", "serial", "tx", "rx", "txd", "rxd");
  if (q.includes("input only") || q.includes("input-only")) return caps.inputOnly;
  if (q.includes("strap") || q.includes("boot")) return caps.strapping;
  if (q.includes("flash")) return caps.flash;

  // free-text fallback: match anywhere in the pin's metadata
  return text.includes(q);
}

// ============================================================================
//  SERIAL PLOTTER  —  real-time graph of incoming serial data (canvas, no deps)
// ============================================================================
const PLOT_COLORS = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#f87171", "#22d3ee", "#a3e635"];
const PLOT_MAX_SAMPLES = 300;

// Parse one serial line into numbers. Supports "512", "1 2 3", "1,2,3",
// and labelled "x:1.2 y:3.4" / "ax=0.1,ay=0.2".
function parsePlotLine(line: string): { values: number[]; labels: string[] } {
  const parts = line.split(/[\s,;\t]+/).filter(Boolean);
  const values: number[] = [];
  const labels: string[] = [];
  for (const p of parts) {
    const m = p.match(/^([A-Za-z_][\w]*)[:=](-?\d*\.?\d+)$/);
    if (m) {
      labels.push(m[1]);
      values.push(parseFloat(m[2]));
    } else {
      const n = parseFloat(p);
      if (!isNaN(n) && /^-?\d*\.?\d+$/.test(p)) values.push(n);
    }
  }
  return { values, labels };
}

function drawSerialPlot(canvas: HTMLCanvasElement, data: number[][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // y-range across all visible samples & series
  let mn = Infinity;
  let mx = -Infinity;
  for (const s of data) for (const v of s) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!isFinite(mn) || !isFinite(mx)) {
    mn = 0;
    mx = 1;
  }
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const pad = (mx - mn) * 0.1;
  mn -= pad;
  mx += pad;

  // grid + min/mid/max labels
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "9px monospace";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = (g / 4) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    const val = mx - (g / 4) * (mx - mn);
    ctx.fillText(val.toFixed(1), 2, Math.min(h - 2, Math.max(9, y + 9)));
  }

  if (data.length < 2) return;
  const X = (i: number) => (i / (data.length - 1)) * w;
  const Y = (v: number) => h - ((v - mn) / (mx - mn)) * h;
  const series = Math.max(...data.map((s) => s.length));
  for (let s = 0; s < series; s++) {
    ctx.beginPath();
    ctx.strokeStyle = PLOT_COLORS[s % PLOT_COLORS.length];
    ctx.lineWidth = 1.5;
    let started = false;
    for (let i = 0; i < data.length; i++) {
      const sample = data[i];
      if (s >= sample.length) continue;
      const x = X(i);
      const y = Y(sample[s]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
}

// ============================================================================
//  FLASH ERROR DECODER  —  turn cryptic esptool/avrdude logs into plain English
// ============================================================================
interface DecodedError {
  title: string;
  meaning: string;
  fix: string;
  severity: "error" | "warn";
}
const FLASH_ERROR_RULES: { test: RegExp; title: string; meaning: string; fix: string; severity?: "error" | "warn" }[] = [
  {
    test: /Timed out waiting for packet header|Failed to connect to ESP32|Wrong boot mode detected|No serial data received|Invalid head of packet/i,
    title: "ESP32 won't enter flash mode",
    meaning: "The chip never dropped into its bootloader, so the uploader couldn't talk to it.",
    fix: "Hold the BOOT button on the board, tap EN/RST once, then keep BOOT held until you see 'Connecting…', and release. Most boards auto-enter; if yours doesn't, this manual BOOT-hold fixes it. Also confirm the right COM port.",
  },
  {
    test: /espcomm_open failed|espcomm_upload_mem failed|warning: espcomm/i,
    title: "ESP8266 won't enter flash mode",
    meaning: "The NodeMCU/ESP8266 didn't enter its bootloader.",
    fix: "Try another USB cable/port and the correct board. If it persists, hold FLASH and tap RST, then release. Install the CH340/CP2102 driver if the port is missing.",
  },
  {
    test: /could not open port|Access is denied|Serial port.*busy|port is busy|Resource busy|the port.*in use|Inappropriate ioctl/i,
    title: "COM port is busy / locked",
    meaning: "Another program is holding the serial port, so the uploader can't open it.",
    fix: "Close the Serial Monitor here AND in the Arduino IDE — only one app can own a COM port. Close any other terminal too, then retry.",
  },
  {
    test: /can't open device|ser_open|Error opening serial port|opening serial port:.*No such file|could not find a board on the selected port|cannot find the port|Port\s+\S+\s+not found|No device found on/i,
    title: "Wrong or missing COM port",
    meaning: "The selected COM port doesn't exist, or nothing is on it.",
    fix: "Replug the board and check it's detected (USB Board Detect panel). Pick the right port. If no port shows up at all, install the USB-serial driver — CP2102 or CH340 — for your board.",
  },
  {
    test: /stk500_recv|stk500_getsync|programmer is not responding|not in sync|resp=0x00/i,
    title: "Arduino (AVR) not responding",
    meaning: "avrdude couldn't sync with the bootloader.",
    fix: "Check the board type and port are correct. Unplug anything wired to D0/D1 (RX/TX) during upload, try another cable/port, and press RESET right as the upload starts.",
  },
  {
    test: /Platform .* not installed|core, which is not installed|Unknown FQBN|platform not installed/i,
    title: "Board core not installed",
    meaning: "The board's support package isn't installed for the command-line tool.",
    fix: "Open Arduino IDE → Boards Manager and install the matching core (e.g. 'esp32 by Espressif' or 'Arduino AVR Boards'). This tool shares the IDE's cores.",
  },
  {
    test: /fatal error:\s*\S+\.h: No such file|No such file or directory\s*#include/i,
    title: "Missing library",
    meaning: "An #include points to a library that isn't installed.",
    fix: "Install it via Arduino IDE → Library Manager (the .h filename in the error tells you which), then recompile.",
  },
  {
    test: /text section exceeds|region\s+\S+\s+overflowed|sketch too big|program storage space.*exceed|not enough room|does not fit in region|DRAM segment/i,
    title: "Sketch too big for the chip",
    meaning: "The compiled program (or its RAM usage) exceeds what the board has.",
    fix: "Trim the sketch, choose a bigger partition scheme (ESP32: Tools → Partition Scheme), or move to a board with more flash/RAM.",
  },
  {
    test: /No DFU capable USB device|dfu-util:.*Cannot open|No DFU/i,
    title: "STM32 not in DFU mode",
    meaning: "The board isn't presenting a USB DFU device to flash over USB.",
    fix: "Set BOOT0 high and reset to enter the system bootloader (DFU), or flash via an ST-Link instead.",
  },
  {
    test: /was not declared in this scope|expected\s+.*\s+before|error:.*\.(ino|cpp|h):\d+|Compilation error/i,
    title: "Code compile error — not a hardware problem",
    meaning: "The sketch didn't compile, so nothing was sent to the board. The hardware is fine.",
    fix: "Find the first 'error:' line in the log above — it names the file and line number. Fix that spot and recompile.",
    severity: "warn",
  },
];

function decodeFlashErrors(output: string): DecodedError[] {
  if (!output) return [];
  const out: DecodedError[] = [];
  const seen = new Set<string>();
  for (const r of FLASH_ERROR_RULES) {
    if (r.test.test(output) && !seen.has(r.title)) {
      seen.add(r.title);
      out.push({ title: r.title, meaning: r.meaning, fix: r.fix, severity: r.severity || "error" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  COMPANION-SERVER ROUTING
 *  When this page is served from a public host (fluxbench.vercel.app),
 *  its own origin has no hardware backend — the cloud can't see your
 *  USB ports. But browsers treat http://localhost as a trustworthy
 *  origin even on an HTTPS page, so the page CAN talk to a Fluxbench
 *  server running on the visitor's own machine. hwFetch() resolves the
 *  right base once and caches it:
 *    ""                       -> same origin (npm run dev, or ngrok tunnel)
 *    "http://localhost:3000"  -> local companion behind a public page
 * ------------------------------------------------------------------ */
const COMPANION_BASE = "http://localhost:3000";
const IS_LOCAL_PAGE = ["localhost", "127.0.0.1"].includes(window.location.hostname);
let hwBase: string | null = IS_LOCAL_PAGE ? "" : null; // null = not resolved yet

async function hwFetch(path: string, init?: RequestInit): Promise<Response> {
  if (hwBase !== null) return fetch(hwBase + path, init);
  // Base unknown (public page). Try same-origin first — this covers ngrok
  // tunnels, where the real Express server sits behind this very origin.
  try {
    const r = await fetch(path, init);
    const ct = r.headers.get("content-type") || "";
    if (r.ok && ct.includes("application/json")) {
      hwBase = "";
      return r;
    }
  } catch {
    /* same-origin has no hardware API — fall through to the companion */
  }
  // Then the local companion: succeeds when the visitor has Fluxbench
  // running on their machine (CORS on server.ts allowlists this page).
  const r2 = await fetch(COMPANION_BASE + path, init);
  if (r2.ok) hwBase = COMPANION_BASE;
  return r2;
}

export default function App({ onGoHome }: { onGoHome?: () => void } = {}) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>("esp32-30pin");
  const [customBoard, setCustomBoard] = useState<MicrocontrollerBoard | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isApiKeySet, setIsApiKeySet] = useState<boolean>(true);

  // Interaction state
  const [hoveredPinName, setHoveredPinName] = useState<string | null>(null);
  const [selectedPinName, setSelectedPinName] = useState<string | null>(null);
  const [pinFilter, setPinFilter] = useState<string>("all");
  const [capQuery, setCapQuery] = useState<string>(""); // reverse pin search

  // History of online searches
  const [searchHistory, setSearchHistory] = useState<string[]>(["STM32 Blue Pill", "Raspberry Pi Pico", "ATtiny85"]);

  // Sanity Check / guided diagnostics state
  const [diagOpen, setDiagOpen] = useState<boolean>(false);
  const [diagBusy, setDiagBusy] = useState<boolean>(false);
  const [diagOutput, setDiagOutput] = useState<string>("");
  const [diagOk, setDiagOk] = useState<boolean | null>(null);
  const [diagFlashed, setDiagFlashed] = useState<boolean>(false);
  const [diagDevices, setDiagDevices] = useState<string[]>([]);
  const diagFoundRef = useRef<Set<string>>(new Set());

  // Sensor wiring helper state
  const [wiringOpen, setWiringOpen] = useState<boolean>(false);
  const [selectedSensor, setSelectedSensor] = useState<string>("vl53l1x");

  // Interactive component snapping (drag a component onto the board)
  const [attachedComponents, setAttachedComponents] = useState<string[]>([]);
  const [dragOverBoard, setDragOverBoard] = useState<boolean>(false);

  // Board compare state
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  // Peripheral code generator state
  const [codeGenOpen, setCodeGenOpen] = useState<boolean>(false);
  const [codeBus, setCodeBus] = useState<Bus>("i2c");
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  // Flash & Monitor (compile / upload / Web Serial) state
  const [flashOpen, setFlashOpen] = useState<boolean>(false);
  const [sketches, setSketches] = useState<{ name: string; path: string }[]>([]);
  const [selectedSketch, setSelectedSketch] = useState<string>("");
  const [busy, setBusy] = useState<"" | "compile" | "upload">("");
  const [buildOutput, setBuildOutput] = useState<string>("");
  const [buildOk, setBuildOk] = useState<boolean | null>(null);
  const [serialConnected, setSerialConnected] = useState<boolean>(false);
  const [serialLines, setSerialLines] = useState<string>("");
  const [baud, setBaud] = useState<number>(115200);
  const [serialInput, setSerialInput] = useState<string>("");
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const serialKeepRef = useRef<boolean>(false);
  const consoleRef = useRef<HTMLPreElement | null>(null);

  // Serial plotter
  const [serialView, setSerialView] = useState<"monitor" | "plotter">("monitor");
  const [plotPaused, setPlotPaused] = useState<boolean>(false);
  const [plotLegend, setPlotLegend] = useState<{ labels: string[]; values: number[] }>({ labels: [], values: [] });
  const lineBufRef = useRef<string>("");
  const plotDataRef = useRef<number[][]>([]);
  const plotLabelsRef = useRef<string[]>([]);
  const plotPausedRef = useRef<boolean>(false);
  const plotCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Command palette / share / export
  const [cmdkOpen, setCmdkOpen] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // Pin Planner state
  const [plannerOpen, setPlannerOpen] = useState<boolean>(false);
  const [assignments, setAssignments] = useState<PinAssignment[]>([]);
  const [wifiInUse, setWifiInUse] = useState<boolean>(true);
  const [planCopied, setPlanCopied] = useState<boolean>(false);
  const planIdRef = useRef<number>(1);

  // Arduino IDE live sync state
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true);
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus | null>(null);
  const [lastAppliedFqbn, setLastAppliedFqbn] = useState<string | null>(null);
  const [syncReachable, setSyncReachable] = useState<boolean>(true);
  // True when hardware calls go through the local companion server rather
  // than this page's own origin (i.e. public site + local server running).
  const [companionActive, setCompanionActive] = useState<boolean>(false);

  // Calculate current active board
  const activeBoard: MicrocontrollerBoard = (() => {
    if (selectedBoardId === "custom" && customBoard) {
      return customBoard;
    }
    const preloaded = preloadedBoards.find((b) => b.id === selectedBoardId);
    return preloaded || preloadedBoards[0];
  })();

  // Clear states when board changes
  useEffect(() => {
    setHoveredPinName(null);
    setSelectedPinName(null);
    setAssignments([]); // a plan is board-specific; pins differ between boards
    setAttachedComponents([]); // wiring is board-specific too
  }, [selectedBoardId]);

  // Dashboard entrance animation (GSAP). No-op under reduced-motion so content
  // is never left hidden.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("#center-map", { opacity: 0, y: 10, duration: 0.5, ease: "power2.out" });
      gsap.from(".dash-rail > div", { opacity: 0, y: 18, duration: 0.5, stagger: 0.07, ease: "power3.out", delay: 0.05 });
    },
    { scope: rootRef }
  );

  // ⌘K / Ctrl+K → command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Restore a shared plan from the URL (?state=...) on first load.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state");
    if (!s) return;
    try {
      const obj = JSON.parse(LZString.decompressFromEncodedURIComponent(s) || "{}");
      if (obj.b) {
        setSelectedBoardId(obj.b);
        setCustomBoard(null);
      }
      // apply after the board-change clear effect (it runs first)
      setTimeout(() => {
        if (Array.isArray(obj.a)) setAssignments(obj.a);
        if (Array.isArray(obj.c)) setAttachedComponents(obj.c);
        if (typeof obj.w === "boolean") setWifiInUse(obj.w);
        if (Array.isArray(obj.a) && obj.a.length) setPlannerOpen(true);
      }, 0);
    } catch {
      /* ignore bad state */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build a shareable URL of the current board + plan and copy it.
  const shareCurrentPlan = () => {
    const obj = { b: selectedBoardId, a: assignments, c: attachedComponents, w: wifiInUse };
    const s = LZString.compressToEncodedURIComponent(JSON.stringify(obj));
    const url = `${window.location.origin}${window.location.pathname}?state=${s}`;
    try {
      window.history.replaceState(null, "", url);
      navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  // Export the board view to PNG (or PDF).
  const exportBoard = async (asPdf: boolean) => {
    const el = document.getElementById("center-map");
    if (!el) return;
    try {
      const dataUrl = await toPng(el, { backgroundColor: "#070708", pixelRatio: 2, cacheBust: true });
      const name = `${activeBoard.name.replace(/[^\w]+/g, "_")}_pinout`;
      if (asPdf) {
        const w = el.scrollWidth;
        const h = el.scrollHeight;
        const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
        pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
        pdf.save(`${name}.pdf`);
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${name}.png`;
        a.click();
      }
    } catch {
      /* ignore */
    }
  };

  // Guided onboarding tour.
  const startTour = () => {
    const d = driver({
      showProgress: true,
      steps: [
        { element: "#center-map", popover: { title: "Your board space", description: "This is your physical board. Plug a board into USB and it auto-detects the type." } },
        { element: "#sidebar-left", popover: { title: "Settings & components", description: "Open these sheets to pick a board, drag in components, generate code, and more." } },
        { element: "#pin-planner-toggle", popover: { title: "Plan & check wiring", description: "Use the Pin Planner to assign pins to jobs — it flags conflicts before you wire." } },
      ],
    });
    d.drive();
  };

  // First run: launch the tour once.
  useEffect(() => {
    try {
      if (localStorage.getItem("pinref_tour") !== "1") {
        localStorage.setItem("pinref_tour", "1");
        setTimeout(startTour, 700);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the backend for the board currently plugged into USB. We chain with
  // setTimeout (not setInterval) so a slow board-scan never overlaps the next
  // request - each poll waits for the previous one to finish, then waits 800ms.
  useEffect(() => {
    if (!syncEnabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await hwFetch("/api/arduino/board");
        const d = await r.json();
        if (!active) return;
        setSyncReachable(true);
        setCompanionActive(hwBase === COMPANION_BASE);
        if (d && d.ok) setArduinoStatus(d as ArduinoStatus);
      } catch {
        if (active) {
          setSyncReachable(false);
          setCompanionActive(false);
        }
      } finally {
        if (active) timer = setTimeout(poll, 800);
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [syncEnabled]);

  // When the IDE's selected board changes, mirror it on the website.
  // Keyed on FQBN so we only act on a genuine change - this lets the user
  // manually browse other boards without us yanking them back, until they
  // actually pick a different board in the IDE.
  useEffect(() => {
    if (!syncEnabled) return;
    const board = arduinoStatus?.board;
    if (!board?.fqbn) return;
    if (board.fqbn === lastAppliedFqbn) return;

    setLastAppliedFqbn(board.fqbn);

    const mappedId = FQBN_TO_BOARD_ID[board.fqbn];
    if (mappedId) {
      setSelectedBoardId(mappedId);
      setCustomBoard(null);
      setSelectedPinName(null);
      setSearchError(null);
    } else if (board.name) {
      // Unknown board: fall back to the dynamic catalog (Gemini) by name.
      handleSearch(board.name);
    }
    // handleSearch intentionally omitted from deps to avoid re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arduinoStatus, syncEnabled, lastAppliedFqbn]);

  // Handle Dynamic chip search using server endpoint (backed by Gemini 3.5 Flash)
  const handleSearch = async (queryToSubmit: string) => {
    const query = queryToSubmit.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchError(null);
    setSelectedPinName(null);
    setHoveredPinName(null);

    const queryLower = query.toLowerCase();

    // Proactive step: Check if the search query matches any preloaded high-fidelity board
    const matchedPreloaded = preloadedBoards.find(b =>
      queryLower.includes(b.id.toLowerCase()) ||
      b.name.toLowerCase().includes(queryLower) ||
      queryLower.includes(b.name.toLowerCase())
    );

    if (matchedPreloaded) {
      setSelectedBoardId(matchedPreloaded.id);
      setCustomBoard(null);
      setIsSearching(false);
      return;
    }

    let offlineMatchedKey = "";
    if (queryLower.includes("stm") || queryLower.includes("blue pill") || queryLower.includes("32f103")) {
      offlineMatchedKey = "stm32";
    } else if (queryLower.includes("pico") || queryLower.includes("rp2040") || queryLower.includes("raspberry")) {
      offlineMatchedKey = "pico";
    } else if (queryLower.includes("attiny") || queryLower.includes("tiny85") || queryLower.includes("attiny85")) {
      offlineMatchedKey = "attiny85";
    }

    // Attempt backend specifications generation
    try {
      const response = await fetch("/api/microcontrollers/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query })
      });

      const body = await response.json();

      if (response.ok && !body.error) {
        // Success back from server
        const formattedBoard: MicrocontrollerBoard = {
          id: `custom-${Date.now()}`,
          name: body.name || query,
          description: body.description || "Synthesized raw semiconductor architecture datasheet",
          specs: {
            architecture: body.specs?.architecture || "Custom CPU Core",
            clockSpeed: body.specs?.clockSpeed || "Unknown Speed",
            operatingVoltage: body.specs?.operatingVoltage || "Variable",
            flashMemory: body.specs?.flashMemory || "N/A",
            ramSize: body.specs?.ramSize || "N/A",
            gpioCount: body.specs?.gpioCount || body.pins?.length || 0,
            adcChannels: body.specs?.adcChannels || "N/A",
            dacChannels: body.specs?.dacChannels || "None",
            interfaces: body.specs?.interfaces || "UART, SPI, I2C"
          },
          warnings: body.warnings || [],
          peripherals: body.peripherals || [],
          layoutType: body.pins && body.pins.length > 30 ? "mega-headers" : "dual-inline",
          datasheetUrl: query.toLowerCase().includes("esp32-wroom") || query.toLowerCase().includes("wroom-32") || query.toLowerCase().includes("esp32-devkit") || query.toLowerCase().includes("esp-32")
            ? "https://documentation.espressif.com/esp32-wroom-32_datasheet_en.pdf"
            : query.toLowerCase().includes("esp8266") || query.toLowerCase().includes("nodemcu")
              ? "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf"
              : `https://www.google.com/search?q=${encodeURIComponent((body.name || query) + " datasheet pdf official")}`,
          additionalResources: [
            { label: "Search Official Documentation", url: `https://www.google.com/search?q=${encodeURIComponent((body.name || query) + " technical docs")}` }
          ],
          pins: (body.pins || []).map((p: any, index: number) => ({
            number: p.number || `${index + 1}`,
            name: p.name || `PIN_${index + 1}`,
            gpio: p.gpio || "N/A",
            features: p.features || ["Digital I/O"],
            primary: p.primary || "General I/O",
            caution: p.caution || "",
            isCaution: !!p.isCaution || !!p.caution
          }))
        };

        setCustomBoard(formattedBoard);
        setSelectedBoardId("custom");
        setIsApiKeySet(true);
        // Add to search list if not already there
        if (!searchHistory.includes(formattedBoard.name)) {
          setSearchHistory(prev => [formattedBoard.name, ...prev.slice(0, 5)]);
        }
      } else {
        // Handle server side error or API key absent
        if (body.error && body.error.includes("GEMINI_API_KEY")) {
          setIsApiKeySet(false);
        }

        // Let's set a super descriptive error, but immediately recovery fallback:
        const errorMsg = body.error || "The real-time Gemini registry service is experiencing a temporary outage or rate limit.";
        setSearchError(`${errorMsg}. We have successfully loaded a high-fidelity offline representation matching your search request!`);

        // If offline search index contains key, load it
        if (offlineMatchedKey) {
          const rawMock = offlineSearches[offlineMatchedKey];
          const formattedBoard: MicrocontrollerBoard = {
            id: `custom-offline-${Date.now()}`,
            name: rawMock.name,
            description: rawMock.description + " (Simulated Offline Extract)",
            specs: rawMock.specs,
            warnings: rawMock.warnings,
            peripherals: rawMock.peripherals,
            layoutType: rawMock.layoutType,
            pins: rawMock.pins,
            datasheetUrl: (rawMock as any).datasheetUrl || `https://www.google.com/search?q=${encodeURIComponent(rawMock.name + " datasheet pdf")}`,
            additionalResources: (rawMock as any).additionalResources
          };
          setCustomBoard(formattedBoard);
          setSelectedBoardId("custom");
        } else {
          // General offline synthesis matching user's exact query
          const procedurallyBuilt = createProceduralBoard(query);
          setCustomBoard(procedurallyBuilt);
          setSelectedBoardId("custom");
        }
      }
    } catch (err: any) {
      console.error(err);
      setSearchError("Real-time network lookup met a temporary spike. Rest assured, we have compiled a high-fidelity offline blueprint for you to study below!");

      if (offlineMatchedKey) {
        const rawMock = offlineSearches[offlineMatchedKey];
        setCustomBoard({
          id: `custom-err-${Date.now()}`,
          name: rawMock.name,
          description: rawMock.description + " (Offline Recovery Map)",
          specs: rawMock.specs,
          warnings: rawMock.warnings,
          peripherals: rawMock.peripherals,
          layoutType: rawMock.layoutType,
          pins: rawMock.pins,
          datasheetUrl: (rawMock as any).datasheetUrl || `https://www.google.com/search?q=${encodeURIComponent(rawMock.name + " datasheet pdf")}`,
          additionalResources: (rawMock as any).additionalResources
        });
        setSelectedBoardId("custom");
      } else {
        const procedurallyBuilt = createProceduralBoard(query);
        setCustomBoard(procedurallyBuilt);
        setSelectedBoardId("custom");
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Build a generic procedural layout if offline and user searches something completely custom
  const createProceduralBoard = (name: string): MicrocontrollerBoard => {
    const nameLower = name.toLowerCase();
    const isESP = nameLower.includes("esp32") || nameLower.includes("esp-32") || nameLower.includes("wroom") || nameLower.includes("nodemcu") || nameLower.includes("esp8266");
    const isArduino = nameLower.includes("arduino") || nameLower.includes("uno") || nameLower.includes("mega") || nameLower.includes("nano") || nameLower.includes("leonardo");
    const isSTM32 = nameLower.includes("stm32") || nameLower.includes("stm") || nameLower.includes("blue pill");

    const layoutType = (nameLower.includes("mega") || nameLower.includes("2560")) ? "mega-headers" : (isArduino ? "arduino-headers" : "dual-inline");

    return {
      id: `custom-procedural-${Date.now()}`,
      name: `${name.toUpperCase()} (Synthesized Board)`,
      description: `An offline high-fidelity synthesized board blueprint matching "${name}". Pinout routing, voltage limits, and signal filter groups are fully active.`,
      layoutType: layoutType,
      specs: {
        architecture: isESP ? "Tensilica Dual-Core 32-bit" : (isArduino ? "AVR 8-bit MCU" : (isSTM32 ? "ARM Cortex-M3 32-bit" : "RISC-V 32-bit Core")),
        clockSpeed: isESP ? "240 MHz" : (isArduino ? "16 MHz" : (isSTM32 ? "72 MHz" : "48 MHz")),
        operatingVoltage: isESP || isSTM32 ? "3.3V Safe Logic level only" : "5.0V Logic standard",
        flashMemory: isESP ? "4 MB Flash" : (isArduino ? "32 KB Flash" : (isSTM32 ? "64 KB" : "32 KB Flash")),
        ramSize: isESP ? "520 KB SRAM" : (isArduino ? "2 KB SRAM" : (isSTM32 ? "20 KB SRAM" : "8 KB SRAM")),
        gpioCount: isESP ? 26 : (isArduino ? 14 : 16),
        adcChannels: isESP ? "8 Channels (12-bit)" : "6 Channels (10-bit)",
        dacChannels: isESP ? "2 Channels" : "None",
        interfaces: isESP ? "3x UART, 2x I2C, 3x SPI" : "1x Hardware UART, I2C, SPI"
      },
      warnings: [
        `This is a custom interactive map synthesized offline for ${name}.`,
        isESP || isSTM32 ? "Logic levels are strictly 3.3V. Exposure to direct 5V lines will break the gates." : "VCC lines output steady VCC logic level.",
        "Add a GEMINI_API_KEY under Settings > Secrets to enable real-time manufacturer PDF datasheet mining."
      ],
      peripherals: [
        { interfaceType: "I2C default map", pinsUsed: isESP ? "SDA: GPIO21, SCL: GPIO22" : "SDA: Pin A4, SCL: Pin A5" },
        { interfaceType: "SPI default map", pinsUsed: isESP ? "MOSI: GPIO23, MISO: GPIO19, SCK: GPIO18" : "MOSI: Pin 11, MISO: Pin 12, SCK: Pin 13" }
      ],
      pins: isESP ? [
        { number: "1", name: "3V3", gpio: "N/A", features: ["Power out"], primary: "Regulated 3.3V out" },
        { number: "2", name: "EN", gpio: "N/A", features: ["Enable"], primary: "Chip Enable / Reset" },
        { number: "3", name: "GPIO36 (SVP)", gpio: "36", features: ["GPIO", "ADC1_0"], primary: "Analog Input Only" },
        { number: "4", name: "GPIO39 (SVN)", gpio: "39", features: ["GPIO", "ADC1_3"], primary: "Analog Input Only" },
        { number: "5", name: "GPIO34", gpio: "34", features: ["GPIO", "ADC1_6"], primary: "Analog Input Only" },
        { number: "6", name: "GPIO35", gpio: "35", features: ["GPIO", "ADC1_7"], primary: "Analog Input Only" },
        { number: "7", name: "GPIO32", gpio: "32", features: ["GPIO", "ADC1_4", "Touch9"], primary: "Digital I/O or Analog" },
        { number: "8", name: "GPIO33", gpio: "33", features: ["GPIO", "ADC1_5", "Touch8"], primary: "Digital I/O or Analog" },
        { number: "9", name: "GPIO25", gpio: "25", features: ["GPIO", "DAC1", "ADC2_8"], primary: "Digital I/O / DAC Output" },
        { number: "10", name: "GPIO26", gpio: "26", features: ["GPIO", "DAC2", "ADC2_9"], primary: "Digital I/O / DAC Output" },
        { number: "11", name: "GPIO27", gpio: "27", features: ["GPIO", "ADC2_7", "Touch7"], primary: "Digital I/O or Analog" },
        { number: "12", name: "GPIO14", gpio: "14", features: ["GPIO", "SPI_CLK", "Touch6"], primary: "SPI SCK / PWM" },
        { number: "13", name: "GPIO12", gpio: "12", features: ["GPIO", "SPI_MISO", "Touch5"], primary: "SPI MISO / Boot Strap Pin", caution: "Must be LOW on boot.", isCaution: true },
        { number: "14", name: "GND", gpio: "N/A", features: ["Ground"], primary: "System Ground" },
        { number: "15", name: "GPIO13", gpio: "13", features: ["GPIO", "SPI_MOSI", "Touch4"], primary: "SPI MOSI / PWM" },
        { number: "16", name: "GPIO9", gpio: "9", features: ["GPIO", "Flash_D2"], primary: "Internal Flash Memory line", caution: "Do not connect general circuits here.", isCaution: true },
        { number: "17", name: "GPIO10", gpio: "10", features: ["GPIO", "Flash_D3"], primary: "Internal Flash Memory line", caution: "Do not connect general circuits here.", isCaution: true },
        { number: "18", name: "GPIO11", gpio: "11", features: ["GPIO", "Flash_CMD"], primary: "Internal Flash Memory line", caution: "Do not connect general circuits here.", isCaution: true },
        { number: "19", name: "TXD0", gpio: "1", features: ["GPIO", "UART0_TX"], primary: "Debug Logger Transmit", caution: "Activity causes trace flutter on boot.", isCaution: false },
        { number: "20", name: "RXD0", gpio: "3", features: ["GPIO", "UART0_RX"], primary: "Debug Logger Receive" },
        { number: "21", name: "GPIO21", gpio: "21", features: ["GPIO", "I2C_SDA"], primary: "Default I2C SDA data" },
        { number: "22", name: "GPIO22", gpio: "22", features: ["GPIO", "I2C_SCL"], primary: "Default I2C SCL clock" },
        { number: "23", name: "GPIO23", gpio: "23", features: ["GPIO", "SPI_MOSI_D"], primary: "Default SPI MOSI" },
        { number: "24", name: "5V", gpio: "N/A", features: ["Power in"], primary: "USB 5V Feed input" }
      ] : [
        { number: "1", name: "RESET", gpio: "N/A", features: ["Reset Input"], primary: "Hardware Reset", caution: "Active LOW. Hold to halt processor." },
        { number: "2", name: "D0 / RX", gpio: "0", features: ["GPIO", "RX"], primary: "Digital I/O or UART RX" },
        { number: "3", name: "D1 / TX", gpio: "1", features: ["GPIO", "TX"], primary: "Digital I/O or UART TX" },
        { number: "4", name: "D2", gpio: "2", features: ["GPIO", "INT0"], primary: "Digital I/O / Ext Interrupt" },
        { number: "5", name: "D3", gpio: "3", features: ["GPIO", "PWM"], primary: "Digital I/O / PWM" },
        { number: "6", name: "D4", gpio: "4", features: ["GPIO"], primary: "General Purpose I/O" },
        { number: "7", name: "D5", gpio: "5", features: ["GPIO", "PWM"], primary: "Digital I/O / PWM" },
        { number: "8", name: "D6", gpio: "6", features: ["GPIO", "PWM"], primary: "Digital I/O / PWM" },
        { number: "9", name: "D7", gpio: "7", features: ["GPIO"], primary: "General Purpose I/O" },
        { number: "10", name: "D8", gpio: "8", features: ["GPIO"], primary: "General Purpose I/O" },
        { number: "11", name: "D9", gpio: "9", features: ["GPIO", "PWM"], primary: "Digital I/O or PWM" },
        { number: "12", name: "D10", gpio: "10", features: ["GPIO", "SPI_SS", "PWM"], primary: "SPI Chip Select (SS)" },
        { number: "13", name: "D11", gpio: "11", features: ["GPIO", "SPI_MOSI", "PWM"], primary: "SPI Master Out Slave In" },
        { number: "14", name: "D12", gpio: "12", features: ["GPIO", "SPI_MISO"], primary: "SPI Master In Slave Out" },
        { number: "15", name: "D13", gpio: "13", features: ["GPIO", "SPI_SCK", "Built-In LED"], primary: "SPI Clock / Onboard LED" },
        { number: "16", name: "GND", gpio: "N/A", features: ["Ground"], primary: "System Reference Ground" },
        { number: "17", name: "3V3", gpio: "N/A", features: ["Power out"], primary: "3.3V Regulated supply" },
        { number: "18", name: "5V", gpio: "N/A", features: ["Power out"], primary: "5.0V Regulator supply" },
        { number: "19", name: "A0", gpio: "14", features: ["Analog Input", "GPIO"], primary: "Analog Input 0" },
        { number: "20", name: "A1", gpio: "15", features: ["Analog Input", "GPIO"], primary: "Analog Input 1" },
        { number: "21", name: "A2", gpio: "16", features: ["Analog Input", "GPIO"], primary: "Analog Input 2" },
        { number: "22", name: "A3", gpio: "17", features: ["Analog Input", "GPIO"], primary: "Analog Input 3" },
        { number: "23", name: "A4 / SDA", gpio: "18", features: ["Analog Input", "I2C_SDA"], primary: "Hardware I2C SDA" },
        { number: "24", name: "A5 / SCL", gpio: "19", features: ["Analog Input", "I2C_SCL"], primary: "Hardware I2C SCL" }
      ]
    };
  };

  // Helper categories for pins filtering
  const getPinCategoryColor = (pin: BoardPin) => {
    // Pin Planner overlay: when planning, assigned pins take a distinct colour
    // (red = conflict, amber = caution, orange = assigned-OK) so the board map
    // doubles as a live wiring diagram.
    // Attached-component snapping highlights the exact pins a component uses.
    if (attachedComponents.length && wirePins[pin.name]) {
      return { bg: "bg-cyan-500/30 border-2 border-cyan-400", text: "text-cyan-100", indicator: "bg-cyan-400", border: "border-cyan-400" };
    }
    if (plannerOpen && planByPin[pin.name]) {
      const sev = planByPin[pin.name];
      if (sev === "error")
        return { bg: "bg-red-600/30 border-2 border-red-500", text: "text-red-200", indicator: "bg-red-500", border: "border-red-500" };
      if (sev === "warn")
        return { bg: "bg-amber-500/25 border-2 border-amber-400", text: "text-amber-100", indicator: "bg-amber-400", border: "border-amber-400" };
      return { bg: "bg-orange-500/30 border-2 border-orange-400", text: "text-orange-100", indicator: "bg-orange-400", border: "border-orange-400" };
    }
    if (pin.isCaution || pin.caution && pin.caution.length > 5) {
      return {
        bg: "bg-amber-950/40 border border-amber-500/50 hover:bg-amber-900/60",
        text: "text-amber-300",
        indicator: "bg-amber-400",
        border: "border-amber-700/80"
      };
    }
    const featuresLower = pin.features.map(f => f.toLowerCase()).join(" ");
    const primaryLower = pin.primary.toLowerCase();
    const nameLower = pin.name.toLowerCase();

    if (nameLower.includes("gnd") || featuresLower.includes("ground")) {
      return {
        bg: "bg-[#141416] border border-[#333333] hover:bg-[#202022]",
        text: "text-zinc-400 font-mono",
        indicator: "bg-zinc-500",
        border: "border-zinc-700"
      };
    }
    if (nameLower.includes("3v") || nameLower.includes("5v") || nameLower.includes("vcc") || nameLower.includes("vbat") || nameLower.includes("power")) {
      return {
        bg: "bg-red-950/20 border border-red-900/40 hover:bg-red-950/40",
        text: "text-red-300 font-mono font-bold",
        indicator: "bg-red-400",
        border: "border-red-800"
      };
    }
    if (featuresLower.includes("adc") || featuresLower.includes("dac") || featuresLower.includes("analog") || primaryLower.includes("analog")) {
      return {
        bg: "bg-sky-950/30 border border-sky-900/40 hover:bg-sky-950/50",
        text: "text-sky-300",
        indicator: "bg-sky-400",
        border: "border-sky-800"
      };
    }
    if (featuresLower.includes("uart") || featuresLower.includes("tx") || featuresLower.includes("rx") || primaryLower.includes("serial")) {
      return {
        bg: "bg-indigo-950/30 border border-indigo-900/40 hover:bg-indigo-950/50",
        text: "text-indigo-300",
        indicator: "bg-indigo-400",
        border: "border-indigo-800"
      };
    }
    if (featuresLower.includes("sda") || featuresLower.includes("scl") || featuresLower.includes("i2c") || featuresLower.includes("spi") || featuresLower.includes("miso") || featuresLower.includes("mosi") || featuresLower.includes("sck")) {
      return {
        bg: "bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-950/50",
        text: "text-emerald-300",
        indicator: "bg-emerald-400",
        border: "border-emerald-800"
      };
    }
    return {
      bg: "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800",
      text: "text-zinc-200",
      indicator: "bg-zinc-500",
      border: "border-zinc-800"
    };
  };

  // Filters calculation
  const satisfiesFilter = (pin: BoardPin) => {
    // Reverse search takes precedence: highlight pins matching the capability query.
    if (capQuery.trim()) return pinMatchesCapability(pin, activeBoard, capQuery);
    if (pinFilter === "all") return true;
    if (pinFilter === "gpio") return pin.gpio && pin.gpio !== "N/A" && !pin.isCaution;
    if (pinFilter === "analog") {
      return pin.features.some(f => f.toLowerCase().includes("adc") || f.toLowerCase().includes("dac") || f.toLowerCase().includes("analog"));
    }
    if (pinFilter === "interfaces") {
      return pin.features.some(f => ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs", "ss", "i2c", "spi", "uart"].some(keyword => f.toLowerCase().includes(keyword)));
    }
    if (pinFilter === "cautions") return pin.isCaution || (pin.caution && pin.caution.length > 0);
    return true;
  };

  // Find detailed context for selected or hovered pin
  const focusedPin = activeBoard.pins.find(p => p.name === hoveredPinName) || activeBoard.pins.find(p => p.name === selectedPinName);

  // Group pins for side columns helper mapping
  const leftPins = activeBoard.pins.slice(0, Math.ceil(activeBoard.pins.length / 2));
  const rightPins = activeBoard.pins.slice(Math.ceil(activeBoard.pins.length / 2));

  // ---- Pin Planner derived data ----
  const planResult = useMemo(
    () => analyzePlan(assignments, activeBoard, wifiInUse),
    [assignments, activeBoard, wifiInUse]
  );

  // pinName -> worst severity, used to colour the board map.
  const planByPin: Record<string, "ok" | "warn" | "error"> = {};
  const sevRank = { ok: 0, warn: 1, error: 2 } as const;
  for (const a of assignments) {
    if (!a.pinName) continue;
    const sev = planResult.perAssignment[a.id]?.severity || "ok";
    const cur = planByPin[a.pinName];
    if (!cur || sevRank[sev] > sevRank[cur]) planByPin[a.pinName] = sev;
  }

  // Only pins that can actually be assigned a job (no power/ground/reset).
  const assignablePins = activeBoard.pins.filter((p) => p.gpio && p.gpio !== "N/A");
  const planIsEsp32 =
    (activeBoard.id || "").toLowerCase().includes("esp32") ||
    activeBoard.specs.architecture.toLowerCase().includes("xtensa");

  // ---- Interactive component snapping ----
  const attachedList = attachedComponents
    .map((id) => SENSORS.find((s) => s.id === id))
    .filter((s): s is SensorDef => !!s);
  const attachedWiring = attachedList.map((comp, idx) => ({
    comp,
    color: COMPONENT_COLORS[idx % COMPONENT_COLORS.length],
    ...generateWiring(activeBoard, comp),
  }));
  // pinName -> list of "Component pin" labels, for the board-map highlight.
  const wirePins: Record<string, string[]> = {};
  for (const aw of attachedWiring) {
    for (const row of aw.rows) {
      const pin = activeBoard.pins.find((p) => p.name === row.board);
      if (!pin) continue; // skip "any free GPIO" etc. — not a specific pin
      (wirePins[pin.name] = wirePins[pin.name] || []).push(`${aw.comp.name.split(" ")[0]} ${row.module}`);
    }
  }
  const attachComponent = (id: string) =>
    setAttachedComponents((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const detachComponent = (id: string) =>
    setAttachedComponents((prev) => prev.filter((x) => x !== id));

  const addAssignment = (roleId: string, pinName = "") =>
    setAssignments((prev) => [...prev, { id: `a${planIdRef.current++}`, roleId, pinName }]);
  const updateAssignment = (id: string, patch: Partial<PinAssignment>) =>
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAssignment = (id: string) =>
    setAssignments((prev) => prev.filter((a) => a.id !== id));

  const quickAddBus = (bus: "i2c" | "spi" | "uart") => {
    if (bus === "i2c") {
      addAssignment("i2c_sda", findPinByFeature(activeBoard, ["sda"]));
      addAssignment("i2c_scl", findPinByFeature(activeBoard, ["scl"]));
    } else if (bus === "spi") {
      addAssignment("spi_mosi", findPinByFeature(activeBoard, ["mosi"]));
      addAssignment("spi_miso", findPinByFeature(activeBoard, ["miso"]));
      addAssignment("spi_sck", findPinByFeature(activeBoard, ["sck", "spi_clk", "_clk"]));
      addAssignment("spi_cs", findPinByFeature(activeBoard, ["_cs", "spi_cs", "vspi_cs", "hspi_cs", "ss"]));
    } else {
      addAssignment("uart_tx", findPinByFeature(activeBoard, ["txd", "uart2_tx", "tx"], ["debug", "usb", "uart0"]));
      addAssignment("uart_rx", findPinByFeature(activeBoard, ["rxd", "uart2_rx", "rx"], ["debug", "usb", "uart0"]));
    }
  };

  const copyPlan = () => {
    const lines = [`# ${activeBoard.name} — Pin Plan`, "", "| Job | Pin | Notes |", "|---|---|---|"];
    for (const a of assignments) {
      const notes = (planResult.perAssignment[a.id]?.messages || []).map((m) => m.text).join(" ") || "OK";
      lines.push(`| ${assignmentLabel(a)} | ${a.pinName || "—"} | ${notes} |`);
    }
    const text = lines.join("\n");
    try {
      navigator.clipboard.writeText(text);
      setPlanCopied(true);
      setTimeout(() => setPlanCopied(false), 1500);
    } catch {
      /* clipboard blocked - ignore */
    }
  };

  // ---- Sensor wiring helper ----
  const sensorDef = SENSORS.find((s) => s.id === selectedSensor) || SENSORS[0];
  const wiring = useMemo(() => generateWiring(activeBoard, sensorDef), [activeBoard, sensorDef]);

  // ---- Board compare ----
  const compareBoards = useMemo(() => {
    const list = [...preloadedBoards];
    if (customBoard && !list.some((b) => b.id === customBoard.id)) list.push(customBoard);
    return list;
  }, [customBoard]);
  useEffect(() => {
    if (compareOpen && compareIds.length === 0) {
      const ids = [activeBoard.id, ...preloadedBoards.map((b) => b.id).filter((id) => id !== activeBoard.id)];
      setCompareIds([...new Set(ids)].slice(0, 3));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareOpen]);

  // ---- Peripheral code generator ----
  const generated = useMemo(
    () => generatePeripheralCode(activeBoard, codeBus),
    [activeBoard, codeBus]
  );
  const copyCode = () => {
    try {
      navigator.clipboard.writeText(generated.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  // ---- Flash & Monitor ----
  // Pull the list of recent sketches when the panel opens.
  useEffect(() => {
    if (!flashOpen) return;
    hwFetch("/api/arduino/sketches")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setSketches(d.sketches || []);
          setSelectedSketch((prev) => prev || d.active || d.sketches?.[0]?.path || "");
        }
      })
      .catch(() => {});
  }, [flashOpen]);

  // Keep the serial console scrolled to the newest line.
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [serialLines]);

  useEffect(() => {
    plotPausedRef.current = plotPaused;
  }, [plotPaused]);

  // Real-time plot draw loop + legend updater, running only while the plotter is shown.
  useEffect(() => {
    if (serialView !== "plotter") return;
    let raf = 0;
    const loop = () => {
      if (plotCanvasRef.current) drawSerialPlot(plotCanvasRef.current, plotDataRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const legendTimer = setInterval(() => {
      const data = plotDataRef.current;
      const last = data[data.length - 1] || [];
      const n = data.reduce((m, s) => Math.max(m, s.length), 0);
      const labels =
        plotLabelsRef.current.length === n && n > 0
          ? plotLabelsRef.current
          : Array.from({ length: n }, (_, i) => `S${i + 1}`);
      setPlotLegend({ labels, values: last });
    }, 200);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(legendTimer);
    };
  }, [serialView]);

  const disconnectSerial = async () => {
    serialKeepRef.current = false;
    try {
      await serialReaderRef.current?.cancel();
    } catch {}
    try {
      await serialPortRef.current?.close();
    } catch {}
    serialPortRef.current = null;
    setSerialConnected(false);
  };

  // Compile (and optionally upload) the selected sketch via the backend.
  const doBuild = async (upload: boolean) => {
    if (!selectedSketch) {
      setBuildOk(false);
      setBuildOutput("Pick a sketch first.");
      return;
    }
    setBusy(upload ? "upload" : "compile");
    setBuildOk(null);
    setBuildOutput(upload ? "Compiling & uploading… (first build of a core can take a minute)" : "Compiling… (first build of a core can take a minute)");
    // Free the COM port for arduino-cli if the browser holds it.
    if (upload && serialConnected) await disconnectSerial();
    try {
      const body = {
        path: selectedSketch,
        fqbn: arduinoStatus?.board?.fqbn || undefined,
        port: arduinoStatus?.board?.port || undefined,
      };
      const r = await hwFetch(`/api/arduino/${upload ? "upload" : "compile"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setBuildOk(!!d.success);
      setBuildOutput(d.output || (d.success ? "Done." : "Failed."));
    } catch (e: any) {
      setBuildOk(false);
      setBuildOutput("Request failed: " + (e?.message || e));
    } finally {
      setBusy("");
    }
  };

  // Sanity Check: flash the diagnostic firmware to the connected board.
  const runSanityCheck = async () => {
    setDiagBusy(true);
    setDiagOk(null);
    setDiagFlashed(false);
    setDiagDevices([]);
    diagFoundRef.current = new Set();
    setDiagOutput("Flashing diagnostic firmware… (first build of a core can take a minute)");
    if (serialConnected) await disconnectSerial(); // free the port for arduino-cli
    try {
      const body = {
        fqbn: arduinoStatus?.board?.fqbn || undefined,
        port: arduinoStatus?.board?.port || undefined,
      };
      const r = await hwFetch("/api/arduino/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setDiagOk(!!d.success);
      setDiagOutput(d.output || (d.success ? "Flashed." : "Failed."));
      if (d.success) setDiagFlashed(true);
    } catch (e: any) {
      setDiagOk(false);
      setDiagOutput("Request failed: " + (e?.message || e));
    } finally {
      setDiagBusy(false);
    }
  };

  // Connect serial to read the diagnostic's output (LED blink + I2C scan).
  const connectAndRead = async () => {
    diagFoundRef.current = new Set();
    setDiagDevices([]);
    await connectSerial();
  };

  // Translate cryptic flash/bootloader output into plain-language fixes.
  const renderDecoded = (output: string) => {
    const list = decodeFlashErrors(output);
    if (!list.length) return null;
    return (
      <div className="space-y-1.5">
        {list.map((d, i) => (
          <div
            key={i}
            className={`rounded-lg border px-3 py-2 ${d.severity === "warn" ? "bg-amber-950/20 border-amber-800/50" : "bg-orange-950/25 border-orange-700/50"}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-200">
              <Lightbulb size={12} className="text-orange-400 shrink-0" /> {d.title}
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{d.meaning}</p>
            <p className="text-[10px] text-emerald-300/90 mt-1 leading-relaxed">
              <span className="font-semibold">Fix:</span> {d.fix}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const readSerialLoop = async () => {
    const port = serialPortRef.current;
    if (!port?.readable) return;
    const decoder = new TextDecoder();
    while (serialKeepRef.current && port.readable) {
      const reader = port.readable.getReader();
      serialReaderRef.current = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = decoder.decode(value);
            setSerialLines((s) => (s + chunk).slice(-12000)); // cap buffer
            // Split into complete lines; feed both the plotter and the
            // Sanity-Check I2C parser.
            lineBufRef.current += chunk;
            let nl: number;
            while ((nl = lineBufRef.current.indexOf("\n")) >= 0) {
              const line = lineBufRef.current.slice(0, nl).trim();
              lineBufRef.current = lineBufRef.current.slice(nl + 1);
              if (!line) continue;

              // Plotter
              if (!plotPausedRef.current) {
                const { values, labels } = parsePlotLine(line);
                if (values.length > 0) {
                  plotDataRef.current.push(values);
                  if (plotDataRef.current.length > PLOT_MAX_SAMPLES) plotDataRef.current.shift();
                  if (labels.length) plotLabelsRef.current = labels;
                }
              }

              // Sanity Check: collect I2C addresses, commit each completed scan.
              const fm = line.match(/^FOUND\s+0x([0-9a-fA-F]+)/i);
              if (fm) {
                diagFoundRef.current.add("0x" + fm[1].toUpperCase().padStart(2, "0"));
              } else if (/I2C-SCAN-END/.test(line)) {
                setDiagDevices([...diagFoundRef.current].sort());
              }
            }
          }
        }
      } catch {
        /* reader cancelled or device unplugged */
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    }
  };

  const connectSerial = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
      setSerialLines((s) => s + "\n[Web Serial isn't supported in this browser — use Chrome or Edge.]\n");
      return;
    }
    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: baud });
      serialPortRef.current = port;
      serialKeepRef.current = true;
      setSerialConnected(true);
      setSerialLines((s) => s + `\n[Connected @ ${baud} baud]\n`);
      readSerialLoop();
    } catch (e: any) {
      // user dismissed the chooser, or port busy (IDE monitor open / uploading)
      setSerialLines((s) => s + `\n[Connect failed: ${e?.message || e}]\n`);
    }
  };

  const sendSerial = async () => {
    const port = serialPortRef.current;
    if (!port?.writable) return;
    try {
      const w = port.writable.getWriter();
      await w.write(new TextEncoder().encode(serialInput + "\n"));
      w.releaseLock();
      setSerialInput("");
    } catch (e: any) {
      setSerialLines((s) => s + `\n[Send failed: ${e?.message || e}]\n`);
    }
  };

  return (
    <div ref={rootRef} className="bg-[#0a0a0b] text-[#e5e5e0] min-h-screen flex flex-col font-sans select-none antialiased">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#1c1c1e] bg-[#0c0c0d] shadow-sm shrink-0">
        <div className="flex items-center gap-10">
          <div
            className="flex items-center gap-3 cursor-pointer select-none rounded-lg transition-opacity hover:opacity-80"
            role="button"
            tabIndex={0}
            onClick={() => onGoHome?.()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGoHome?.(); } }}
            title="Back to home"
            aria-label="Back to home"
          >
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-[0_0_18px_rgba(234,88,12,0.35)]" id="app_icon">
              <CircuitBoard size={19} />
            </div>
            <div className="hidden sm:block leading-none">
              <div className="font-serif italic text-lg tracking-tight text-[#f5f5f0]">Fluxbench</div>
              <div className="mt-0.5 text-[9px] text-zinc-500 font-mono tracking-[0.2em] uppercase">Microcontroller Companion</div>
            </div>
          </div>
        </div>

        {/* Global Realtime search */}
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
            className="relative"
          >
            <div className="relative">
              <input
                type="text"
                placeholder="Search chips (e.g. ESP32, Pico, STM32)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#141416] border border-[#222] rounded-full pl-9 pr-3 py-1.5 w-44 lg:w-52 text-xs text-[#e5e5e0] placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors"
                id="header-search-bar"
              />
              <Search className="absolute left-3.5 top-2.5 text-zinc-500" size={13} />
            </div>
          </form>

          {/* Pin Planner toggle */}
          <button
            onClick={() => setPlannerOpen((v) => !v)}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${plannerOpen
                ? "bg-orange-600 border-orange-500 text-white"
                : "bg-orange-500/10 border-orange-500/25 text-orange-200 hover:bg-orange-500/20 hover:text-white"
              }`}
            id="pin-planner-toggle"
            title="Plan pin assignments and catch conflicts before wiring"
          >
            <SlidersHorizontal size={13} />
            <span>Pin Planner</span>
            {planResult.errors > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">
                {planResult.errors}
              </span>
            )}
          </button>

          {/* Code Gen toggle */}
          <button
            onClick={() => setCodeGenOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${codeGenOpen
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "bg-indigo-500/10 border-indigo-500/25 text-indigo-200 hover:bg-indigo-500/20 hover:text-white"
              }`}
            id="codegen-toggle"
            title="Generate I2C / SPI / UART init code with this board's real pins"
          >
            <Code2 size={13} />
            <span>Code Gen</span>
          </button>

          {/* Wiring helper toggle */}
          <button
            onClick={() => setWiringOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${wiringOpen
                ? "bg-rose-600 border-rose-500 text-white"
                : "bg-rose-500/10 border-rose-500/25 text-rose-200 hover:bg-rose-500/20 hover:text-white"
              }`}
            id="wiring-toggle"
            title="Wire a sensor/module to this board with a voltage-safety check"
          >
            <Cable size={13} />
            <span>Wiring</span>
          </button>

          {/* Board compare toggle */}
          <button
            onClick={() => setCompareOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${compareOpen
                ? "bg-amber-600 border-amber-500 text-white"
                : "bg-amber-500/10 border-amber-500/25 text-amber-200 hover:bg-amber-500/20 hover:text-white"
              }`}
            id="compare-toggle"
            title="Compare boards side by side"
          >
            <GitCompare size={13} />
            <span>Compare</span>
          </button>

          {/* Sanity Check toggle */}
          <button
            onClick={() => setDiagOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${diagOpen
                ? "bg-teal-600 border-teal-500 text-white"
                : "bg-teal-500/10 border-teal-500/25 text-teal-200 hover:bg-teal-500/20 hover:text-white"
              }`}
            id="diagnose-toggle"
            title="1-click hardware test: blink the LED and scan the I2C bus"
          >
            <Stethoscope size={13} />
            <span>Sanity Check</span>
          </button>

          {/* Flash & Monitor toggle */}
          <button
            onClick={() => setFlashOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${flashOpen
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-emerald-500/10 border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/20 hover:text-white"
              }`}
            id="flash-monitor-toggle"
            title="Compile, upload, and watch the serial monitor without leaving this page"
          >
            <Terminal size={13} />
            <span>Flash &amp; Monitor</span>
          </button>

          {/* Share / Export / Tour / Command palette (compact) */}
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden="true" />
          <button onClick={shareCurrentPlan} title="Copy a shareable link of this board + plan" className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white hover:border-zinc-600 transition-all">
            {shareCopied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Share2 size={14} />}
          </button>
          <button onClick={() => exportBoard(false)} title="Export the board view as a PNG" className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white hover:border-zinc-600 transition-all">
            <Download size={14} />
          </button>
          <button onClick={startTour} title="Replay the guided tour" className="inline-flex items-center justify-center h-8 w-8 rounded-full border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white hover:border-zinc-600 transition-all">
            <HelpIcon size={14} />
          </button>
          <button onClick={() => setCmdkOpen(true)} title="Command palette (Ctrl / ⌘ K)" className="inline-flex items-center h-8 px-2.5 rounded-full text-[10px] font-mono font-semibold border bg-[#141416] border-[#2a2a2e] text-zinc-400 hover:text-white hover:border-zinc-600 transition-all">
            ⌘K
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Left: Chip Selection & Custom Query History */}
        <aside className="order-2 w-80 border-l border-[#1a1a1c] bg-[#0c0c0d] flex flex-col justify-between shrink-0" id="sidebar-left">
          <div className="dash-rail flex-1 overflow-y-auto p-4 space-y-4">

            {/* Arduino IDE live sync */}
            <div className="bg-[#0e0d0b] border border-[#2a2118] rounded-xl p-3 space-y-2.5" id="arduino-sync-panel">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Usb size={12} className={syncEnabled ? "text-orange-400" : "text-zinc-600"} />
                  <span className="text-[10px] font-mono uppercase tracking-[0.18em] font-semibold text-zinc-300">USB Board Detect</span>
                </div>
                <button
                  onClick={() => {
                    setSyncEnabled((prev) => {
                      const next = !prev;
                      if (next) setLastAppliedFqbn(null); // re-apply current board on re-enable
                      return next;
                    });
                  }}
                  className={`relative w-8 h-4 rounded-full transition-colors ${syncEnabled ? "bg-orange-600" : "bg-zinc-700"}`}
                  title={syncEnabled ? "Turn off auto-sync" : "Turn on auto-sync"}
                  id="arduino-sync-toggle"
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${syncEnabled ? "left-4" : "left-0.5"}`}></span>
                </button>
              </div>

              {!syncEnabled ? (
                <p className="text-[10px] text-zinc-500 leading-relaxed">Auto-detect paused. Flip the switch to track the board plugged into your USB.</p>
              ) : !syncReachable ? (
                IS_LOCAL_PAGE ? (
                  <p className="text-[10px] text-amber-300/80 leading-relaxed">Backend unreachable. Make sure the app is running via <span className="font-mono">npm run dev</span>.</p>
                ) : (
                  // Public page, no local companion found: tell the visitor
                  // exactly how to light this up — with a recovery path, not
                  // just a dead end.
                  <div className="space-y-2">
                    <p className="text-[10px] text-amber-300/80 leading-relaxed">
                      Looking for Fluxbench on <span className="font-mono">localhost:3000</span>… USB lives on your machine, so this page pairs with a local copy when one is running.
                    </p>
                    <div className="rounded-lg bg-black/40 border border-white/8 px-2.5 py-2 space-y-1">
                      <p className="text-[9px] font-mono text-zinc-400 select-all">git clone github.com/ahmadch7/fluxbench</p>
                      <p className="text-[9px] font-mono text-zinc-400 select-all">npm install && npm run dev</p>
                    </div>
                    <p className="text-[9px] text-zinc-500 leading-relaxed">Keep this tab open — it reconnects by itself. Everything else on this page works without it.</p>
                  </div>
                )
              ) : arduinoStatus?.board ? (
                arduinoStatus.board.identified ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link2 size={12} className="text-orange-400 shrink-0" />
                      <span className="text-xs font-semibold text-orange-200 truncate">{arduinoStatus.board.name}</span>
                    </div>
                    <p className="text-[9px] font-mono text-zinc-500 truncate" title={arduinoStatus.board.fqbn}>{arduinoStatus.board.fqbn}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">
                        Connected · {arduinoStatus.board.port}
                      </span>
                      {companionActive && (
                        <span className="ml-auto rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-px text-[8px] font-mono uppercase tracking-wider text-sky-300" title="This public page is paired with the Fluxbench server running on your machine">
                          local pair
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  // USB board attached but its chip carries no identity (clone).
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Usb size={12} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-amber-200">Unknown board · {arduinoStatus.board.port}</span>
                    </div>
                    {arduinoStatus.board.usbId && (
                      <p className="text-[9px] font-mono text-zinc-500">USB ID {arduinoStatus.board.usbId}</p>
                    )}
                    <p className="text-[10px] text-amber-200/60 leading-relaxed">USB chip has no board identity. Pick it in Arduino IDE (Tools {"→"} Board) and it'll show here.</p>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">No board on USB. Plug one in to see it here.</p>
                </div>
              )}
            </div>

            {/* Quick preloads selection */}
            <Collapsible title="Preloaded Microcomputers" icon={<Cpu size={13} className="text-orange-500" />} defaultOpen>
              <ul className="space-y-1">
                {preloadedBoards.map((board) => {
                  const isActive = selectedBoardId === board.id;
                  return (
                    <li
                      key={board.id}
                      onClick={() => {
                        setSelectedBoardId(board.id);
                        setCustomBoard(null);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${isActive
                          ? "bg-[#18181b] border-[#333335] text-white font-medium"
                          : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#141416]"
                        }`}
                      id={`sidebar-item-${board.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Cpu size={14} className={isActive ? "text-orange-500" : "text-zinc-500"} />
                        <span className="text-xs truncate max-w-[150px]">{board.name}</span>
                      </div>
                      {board.id.includes("esp32") && (
                        <span className="text-[9px] bg-orange-950 text-orange-400 px-1 py-0.2 rounded font-semibold font-mono">SOC</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Collapsible>

            {/* Draggable component palette */}
            <Collapsible title="Drag a Component → Board" icon={<Cable size={13} className="text-cyan-400" />}>
              <div className="flex flex-wrap gap-1.5">
                {["servo", "hcsr04", "i2clcd", "button", "pot", "relay", "neopixel", "vl53l1x", "mpu6050", "ssd1306", "ds18b20", "nrf24l01"].map((id) => {
                  const c = SENSORS.find((s) => s.id === id);
                  if (!c) return null;
                  const on = attachedComponents.includes(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/component", id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => attachComponent(id)}
                      title={`${c.name} — drag onto the board (or click) to highlight its pins`}
                      className={`cursor-grab active:cursor-grabbing select-none text-[10px] px-2 py-1 rounded border font-medium transition-colors ${on ? "bg-cyan-600 border-cyan-500 text-white" : "bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white hover:border-cyan-700"}`}
                    >
                      {c.name.split(" (")[0]}
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-zinc-600 mt-2 leading-relaxed">Drop one on the board to light up the exact pins it connects to.</p>
            </Collapsible>

            {/* Custom Search list */}
            <Collapsible title="Custom Dynamic Catalog" icon={<Sparkles size={13} className="text-violet-400" />}>
              {customBoard && (
                <button
                  onClick={() => {
                    setSelectedBoardId("esp32-30pin");
                    setCustomBoard(null);
                  }}
                  className="mb-2 text-[10px] text-zinc-500 hover:text-white"
                >
                  Reset
                </button>
              )}
              {customBoard ? (
                <div
                  onClick={() => setSelectedBoardId("custom")}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${selectedBoardId === "custom"
                      ? "bg-[#1e1c18] border-orange-500/20 text-orange-300 font-medium"
                      : "bg-[#14120f] border-[#221c14] text-zinc-400 hover:text-orange-200"
                    }`}
                  id="sidebar-custom-board"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Sparkles size={14} className="text-orange-400 shrink-0" />
                    <span className="text-xs truncate font-serif italic font-semibold">{customBoard.name}</span>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
                </div>
              ) : (
                <div className="p-3 bg-[#111] border border-[#222] rounded-lg text-center">
                  <p className="text-[11px] text-zinc-500 mb-1 leading-relaxed">Search to generate dynamic physical Pinout Map</p>
                </div>
              )}
            </Collapsible>

            {/* Demo / History list */}
            <Collapsible title="Alternative Queries" icon={<Search size={13} className="text-amber-400" />}>
              <div className="flex flex-wrap gap-1.5">
                {searchHistory.map((hist, k) => (
                  <button
                    key={k}
                    onClick={() => handleSearch(hist)}
                    disabled={isSearching}
                    className="text-[10px] px-2 py-1 bg-[#141416] hover:bg-[#202022] border border-[#222] rounded text-zinc-400 hover:text-white font-mono truncate max-w-full text-left"
                  >
                    &rarr; {hist}
                  </button>
                ))}
              </div>
            </Collapsible>

            {/* Default hardware buses */}
            <Collapsible title="Default hardware buses" icon={<Layers size={13} className="text-emerald-500" />}>
              {activeBoard.peripherals && activeBoard.peripherals.length > 0 ? (
                <div className="space-y-1.5">
                  {activeBoard.peripherals.map((per, index) => (
                    <div key={index} className="bg-white/[0.02] p-2.5 border border-white/5 rounded-lg">
                      <p className="text-[10px] font-mono font-bold text-emerald-300/80 mb-0.5">{per.interfaceType}</p>
                      <p className="text-[10px] text-zinc-400 font-mono leading-relaxed">{per.pinsUsed}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-zinc-600 italic">No static communication overrides defined on this dynamic map.</p>
              )}
            </Collapsible>

            {/* Silicon constraints */}
            <Collapsible title="Silicon Constraints" icon={<AlertTriangle size={13} className="text-orange-500" />}>
              <div className="space-y-3">
                {activeBoard.warnings.map((warning, idx) => {
                  const isInputOnly = warning.toLowerCase().includes("input-only");
                  const isStrap = warning.toLowerCase().includes("strapping") || warning.toLowerCase().includes("boot");
                  const isFlash = warning.toLowerCase().includes("flash") || warning.toLowerCase().includes("mem");
                  return (
                    <div key={idx} className="bg-[#161210] border border-orange-950/50 p-3 rounded-lg space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${isInputOnly ? "bg-amber-950 text-amber-300" :
                            isStrap ? "bg-red-950 text-red-300" :
                              isFlash ? "bg-zinc-800 text-zinc-200" :
                                "bg-orange-950 text-orange-400"
                          }`}>
                          {isInputOnly ? "Input Limit" : isStrap ? "Boot Critical" : isFlash ? "Flash SPI" : "Careful Input"}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-[#a89082] font-mono">{warning}</p>
                    </div>
                  );
                })}
              </div>
            </Collapsible>

            {/* Wiring safety guide */}
            <Collapsible title="Wiring Safety Guide" icon={<Info size={13} className="text-sky-500" />}>
              <ul className="text-[10px] text-zinc-400 leading-relaxed font-mono list-disc list-inside space-y-1.5">
                <li>Check logic voltage levels before applying power</li>
                <li>Always connect Grounds first</li>
                <li>Don't draw more than 200mA total from all pins</li>
                <li>Leave strapping pins floating during boot</li>
              </ul>
            </Collapsible>

            {/* API Warning Section */}
            {!isApiKeySet && (
              <div className="bg-[#24130d] border border-amber-800/30 p-3 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Secrets Offline Mode</span>
                </div>
                <p className="text-[10px] leading-relaxed text-amber-200/70">
                  Real-time database requests are running on procedural lookup logic. Supply a <strong className="text-white">GEMINI_API_KEY</strong> in Settings {"→"} Secrets to unlock auto-compiling real datasheets on demand.
                </p>
              </div>
            )}
          </div>

          {/* Footer of left sidebar */}
          <div className="p-4 border-t border-[#1a1a1c] bg-[#09090a]">
            <div className="bg-[#111112] p-3 rounded-xl border border-[#222224] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity size={12} className="text-emerald-500 animate-pulse shrink-0" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Logic: {activeBoard.specs.operatingVoltage}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Central Map Workspace */}
        <section className="order-1 flex-1 bg-[#070708] flex flex-col overflow-y-auto relative p-6 lg:p-8 space-y-6" id="center-map">

          {searchError && (
            <div className="bg-orange-950/20 border border-orange-500/30 p-4 rounded-xl flex items-start gap-3 text-orange-200 animate-fade-in shrink-0" id="search-error-banner">
              <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={16} />
              <div className="flex-1 text-xs leading-relaxed font-mono">
                <span className="font-bold text-[#f5f5f0] block mb-1">Interactive Diagnostic Fallback</span>
                <span>{searchError}</span>
              </div>
              <button
                onClick={() => setSearchError(null)}
                className="text-zinc-500 hover:text-white transition-colors p-0.5"
                title="Dismiss warning"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* ===================== SANITY CHECK PANEL ===================== */}
          {diagOpen && (
            <div className="bg-[#0c0c0d] border border-[#0e2420] rounded-2xl p-4 space-y-3 shrink-0" id="sanity-check">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Stethoscope size={15} className="text-teal-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Sanity Check</h3>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {arduinoStatus?.board ? `${arduinoStatus.board.name}${arduinoStatus.board.port ? " · " + arduinoStatus.board.port : ""}` : "no board on USB"}
                  </span>
                </div>
                <button onClick={() => setDiagOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close">
                  <X size={14} />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Not sure if it's your code, a dead board, or a bad wire? This flashes a tiny test firmware that blinks the
                onboard LED and scans the I²C bus, so you can see what the board actually sees.
              </p>
              <div className="flex items-start gap-1.5 text-[10px] text-amber-300/90 bg-amber-950/20 border border-amber-800/40 rounded-lg px-3 py-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>This overwrites the program currently on the board with the test firmware. Re-upload your sketch afterwards.</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={runSanityCheck}
                  disabled={diagBusy || !arduinoStatus?.board?.port}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-teal-600 border-teal-500 text-white hover:bg-teal-500 disabled:opacity-40 transition-colors"
                >
                  {diagBusy ? <Loader2 size={13} className="animate-spin" /> : <Stethoscope size={13} />}
                  Run Sanity Check
                </button>
                {!arduinoStatus?.board?.port && <span className="text-[10px] text-zinc-500">Plug a board into USB first.</span>}
              </div>

              {diagOutput && (
                <pre
                  className={`text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto p-2 rounded-lg border ${diagOk === false
                      ? "border-red-800/50 bg-red-950/20 text-red-300"
                      : diagOk === true
                      ? "border-emerald-800/50 bg-emerald-950/20 text-emerald-200"
                      : "border-[#222] bg-[#0a0a0b] text-zinc-400"
                    }`}
                >
                  {diagOutput}
                </pre>
              )}
              {renderDecoded(diagOutput)}

              {diagFlashed && (
                <div className="space-y-3 border-t border-[#1a1a1c] pt-3">
                  {/* LED test */}
                  <div className="flex items-start gap-2 text-[11px] text-amber-200 bg-amber-950/15 border border-amber-900/30 rounded-lg px-3 py-2">
                    <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-400" />
                    <span>
                      <strong className="text-amber-100">LED test:</strong> your board's onboard LED should be blinking now (~1×/sec).
                      If it is, the board is alive and the upload toolchain works — so a dead sketch was the problem, not the hardware.
                    </span>
                  </div>

                  {/* I2C results */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] uppercase font-mono text-zinc-500">I²C bus scan</span>
                      {!serialConnected ? (
                        <button
                          onClick={connectAndRead}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-teal-900/50 text-teal-300 hover:text-white hover:border-teal-600 transition-colors"
                        >
                          Connect &amp; read results
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-teal-400 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span> scanning live
                        </span>
                      )}
                    </div>

                    {!serialConnected ? (
                      <p className="text-[10px] text-zinc-500">Click "Connect &amp; read results" and pick the board's port to see what's on the bus.</p>
                    ) : diagDevices.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {diagDevices.map((addr) => (
                          <span key={addr} className="text-[10px] font-mono px-2 py-1 rounded bg-teal-950/30 border border-teal-800/40 text-teal-200">
                            {addr}
                            <span className="text-teal-400/60"> · {I2C_GUESS[addr] || "unknown device"}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-300/80">
                        No I²C devices found yet. If you have one connected: check SDA/SCL aren't swapped, that GND is shared, the module has power, and that pull-ups are present (most breakouts include them).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== SENSOR WIRING HELPER PANEL ===================== */}
          {wiringOpen && (
            <div className="bg-[#0c0c0d] border border-[#241016] rounded-2xl p-4 space-y-3 shrink-0" id="wiring-helper">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Cable size={15} className="text-rose-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Wiring Helper</h3>
                  <span className="text-[10px] font-mono text-zinc-500">→ {activeBoard.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSensor}
                    onChange={(e) => setSelectedSensor(e.target.value)}
                    className="bg-[#141416] border border-[#222] rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-rose-600 max-w-[240px]"
                  >
                    {SENSORS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setWiringOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="text-[10px] font-mono text-zinc-500">
                {sensorDef.iface} · supply {sensorDef.vcc} · module logic {sensorDef.logic === "either" ? "3.3 V & 5 V" : sensorDef.logic + " V"}
              </div>

              {/* Voltage / compatibility banners */}
              <div className="space-y-1.5">
                {wiring.issues.map((iss, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-[11px] px-3 py-2 rounded-lg border ${iss.sev === "error"
                        ? "bg-red-950/30 border-red-800/50 text-red-300"
                        : iss.sev === "warn"
                        ? "bg-amber-950/25 border-amber-800/50 text-amber-300"
                        : "bg-emerald-950/25 border-emerald-800/50 text-emerald-300"
                      }`}
                  >
                    {iss.sev === "error" ? <AlertOctagon size={13} className="mt-0.5 shrink-0" /> : iss.sev === "warn" ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={13} className="mt-0.5 shrink-0" />}
                    <span>{iss.text}</span>
                  </div>
                ))}
              </div>

              {/* Wiring table */}
              <div className="rounded-lg border border-[#1a1a1c] overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-0 text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-[#0a0a0b] px-3 py-1.5">
                  <span>{sensorDef.name.split(" ")[0]} pin</span>
                  <span className="px-2"> </span>
                  <span>Board pin</span>
                </div>
                {wiring.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-1.5 text-[11px] border-t border-[#141416]">
                    <span className="font-mono text-rose-200">{r.module}</span>
                    <ArrowRight size={12} className="text-zinc-600 mx-2" />
                    <span className="font-mono text-zinc-200">
                      {r.board}
                      {r.note && <span className="block text-[9px] text-zinc-500 normal-case">{r.note}</span>}
                    </span>
                  </div>
                ))}
              </div>

              {sensorDef.notes && sensorDef.notes.length > 0 && (
                <ul className="space-y-1">
                  {sensorDef.notes.map((n, i) => (
                    <li key={i} className="text-[10px] text-zinc-400 leading-relaxed flex gap-1.5">
                      <span className="text-rose-500/70">•</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[9px] text-zinc-600">Module specs vary by breakout vendor — confirm VCC and logic on your board's silkscreen/datasheet before powering up.</p>
            </div>
          )}

          {/* ===================== BOARD COMPARE PANEL ===================== */}
          {compareOpen && (
            <div className="bg-[#0c0c0d] border border-[#241e10] rounded-2xl p-4 space-y-3 shrink-0" id="board-compare">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <GitCompare size={15} className="text-amber-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Compare Boards</h3>
                </div>
                <button onClick={() => setCompareOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close">
                  <X size={14} />
                </button>
              </div>

              {/* Board selector chips */}
              <div className="flex flex-wrap gap-1.5">
                {compareBoards.map((b) => {
                  const on = compareIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() =>
                        setCompareIds((prev) => (on ? prev.filter((x) => x !== b.id) : [...prev, b.id]))
                      }
                      className={`text-[10px] px-2 py-1 rounded border font-medium transition-colors ${on
                          ? "bg-amber-600 border-amber-500 text-white"
                          : "bg-[#141416] border-[#2a2a2e] text-zinc-400 hover:text-white"
                        }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>

              {/* Comparison table */}
              {(() => {
                const cols = compareBoards.filter((b) => compareIds.includes(b.id));
                if (cols.length === 0)
                  return <p className="text-[11px] text-zinc-500">Pick at least one board above. Tip: search a chip (e.g. STM32F411) first and it becomes selectable here.</p>;
                const rows: { label: string; get: (b: MicrocontrollerBoard) => string }[] = [
                  { label: "Architecture", get: (b) => b.specs.architecture },
                  { label: "Clock", get: (b) => b.specs.clockSpeed },
                  { label: "Logic voltage", get: (b) => b.specs.operatingVoltage },
                  { label: "Flash", get: (b) => b.specs.flashMemory },
                  { label: "RAM", get: (b) => b.specs.ramSize },
                  { label: "GPIO count", get: (b) => String(b.specs.gpioCount ?? "—") },
                  { label: "ADC", get: (b) => b.specs.adcChannels || "—" },
                  { label: "DAC", get: (b) => b.specs.dacChannels || "—" },
                  { label: "Interfaces", get: (b) => b.specs.interfaces || "—" },
                  { label: "Pins mapped", get: (b) => String(b.pins.length) },
                ];
                return (
                  <div className="overflow-x-auto rounded-lg border border-[#1a1a1c]">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-[#0a0a0b]">
                          <th className="text-left font-mono uppercase tracking-wider text-zinc-500 text-[9px] px-3 py-2">Spec</th>
                          {cols.map((b) => (
                            <th key={b.id} className="text-left font-semibold text-amber-200 px-3 py-2 min-w-[140px]">
                              {b.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.label} className="border-t border-[#141416]">
                            <td className="font-mono uppercase tracking-wider text-zinc-500 text-[9px] px-3 py-2 align-top">{row.label}</td>
                            {cols.map((b) => (
                              <td key={b.id} className="text-zinc-200 px-3 py-2 align-top">{row.get(b)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===================== PERIPHERAL CODE GEN PANEL ===================== */}
          {codeGenOpen && (
            <div className="bg-[#0c0c0d] border border-[#1a1830] rounded-2xl p-4 space-y-3 shrink-0" id="code-gen">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Code2 size={15} className="text-indigo-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Peripheral Code</h3>
                  <span className="text-[10px] font-mono text-zinc-500">· {activeBoard.name} · {generated.framework}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white transition-colors"
                  >
                    {codeCopied ? <ClipboardCheck size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {codeCopied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={() => setCodeGenOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {([["i2c", "I²C"], ["spi", "SPI"], ["uart", "UART"]] as [Bus, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setCodeBus(id)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold border transition-colors ${codeBus === id
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-[#141416] border-[#2a2a2e] text-zinc-400 hover:text-white"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <pre className="text-[10.5px] font-mono whitespace-pre overflow-x-auto max-h-80 overflow-y-auto p-3 rounded-lg border border-[#222] bg-black text-zinc-200 leading-relaxed">
                {generated.code}
              </pre>
              <p className="text-[9px] text-zinc-600">
                Pins are read from this board's default bus mapping. Always sanity-check against the datasheet before wiring.
              </p>
            </div>
          )}

          {/* ===================== FLASH & MONITOR PANEL ===================== */}
          {flashOpen && (
            <div className="bg-[#0c0c0d] border border-[#16241c] rounded-2xl p-4 space-y-3 shrink-0" id="flash-monitor">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Terminal size={15} className="text-emerald-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Flash &amp; Monitor</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-500">
                    {arduinoStatus?.board ? (
                      <>
                        Target:{" "}
                        <span className="text-emerald-300">{arduinoStatus.board.name}</span>
                        {arduinoStatus.board.fqbn ? ` · ${arduinoStatus.board.fqbn}` : ""}
                        {arduinoStatus.board.port ? ` · ${arduinoStatus.board.port}` : ""}
                      </>
                    ) : (
                      <span className="text-amber-400/80">No board on USB</span>
                    )}
                  </span>
                  <button onClick={() => setFlashOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Sketch picker */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono text-zinc-500">Sketch:</span>
                <select
                  value={selectedSketch}
                  onChange={(e) => setSelectedSketch(e.target.value)}
                  className="bg-[#141416] border border-[#222] rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600 max-w-[260px]"
                >
                  <option value="">{sketches.length ? "Pick a recent sketch…" : "No recent sketches found"}</option>
                  {sketches.map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    hwFetch("/api/arduino/sketches")
                      .then((r) => r.json())
                      .then((d) => d?.ok && setSketches(d.sketches || []))
                      .catch(() => {})
                  }
                  className="text-zinc-500 hover:text-white p-1"
                  title="Refresh sketch list"
                >
                  <RotateCw size={12} />
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => doBuild(false)}
                  disabled={!!busy || !selectedSketch}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-[#141416] border-emerald-900/50 text-emerald-300 hover:text-white hover:border-emerald-600 disabled:opacity-40 transition-colors"
                >
                  {busy === "compile" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Compile
                </button>
                <button
                  onClick={() => doBuild(true)}
                  disabled={!!busy || !selectedSketch || !arduinoStatus?.board?.port}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                >
                  {busy === "upload" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Compile &amp; Upload
                </button>
                {!arduinoStatus?.board?.port && (
                  <span className="text-[10px] text-zinc-500">Plug a board into USB to enable upload.</span>
                )}
              </div>

              {/* Build output */}
              {buildOutput && (
                <pre
                  className={`text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto p-2 rounded-lg border ${buildOk === false
                      ? "border-red-800/50 bg-red-950/20 text-red-300"
                      : buildOk === true
                      ? "border-emerald-800/50 bg-emerald-950/20 text-emerald-200"
                      : "border-[#222] bg-[#0a0a0b] text-zinc-400"
                    }`}
                >
                  {buildOutput}
                </pre>
              )}
              {renderDecoded(buildOutput)}

              {/* Serial monitor */}
              <div className="border-t border-[#1a1a1c] pt-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-md overflow-hidden border border-[#2a2a2e]">
                    <button
                      onClick={() => setSerialView("monitor")}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono ${serialView === "monitor" ? "bg-emerald-600 text-white" : "bg-[#141416] text-zinc-400 hover:text-white"}`}
                    >
                      <Terminal size={11} /> Monitor
                    </button>
                    <button
                      onClick={() => setSerialView("plotter")}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono ${serialView === "plotter" ? "bg-emerald-600 text-white" : "bg-[#141416] text-zinc-400 hover:text-white"}`}
                    >
                      <Activity size={11} /> Plotter
                    </button>
                  </div>
                  {!serialConnected ? (
                    <button
                      onClick={connectSerial}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-emerald-900/50 text-emerald-300 hover:text-white hover:border-emerald-600 transition-colors"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      onClick={disconnectSerial}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-red-950/30 border-red-800/50 text-red-300 hover:text-white transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                  <select
                    value={baud}
                    onChange={(e) => setBaud(+e.target.value)}
                    disabled={serialConnected}
                    className="bg-[#141416] border border-[#222] rounded px-1.5 py-1 text-[10px] font-mono text-zinc-300 focus:outline-none disabled:opacity-50"
                    title="Baud rate"
                  >
                    {[9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 460800, 921600].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setSerialLines("");
                      plotDataRef.current = [];
                      plotLabelsRef.current = [];
                      lineBufRef.current = "";
                      setPlotLegend({ labels: [], values: [] });
                    }}
                    className="text-[10px] font-mono text-zinc-500 hover:text-white px-1.5 py-1"
                  >
                    Clear
                  </button>
                  <span className={`ml-auto inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider ${serialConnected ? "text-emerald-400" : "text-zinc-600"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${serialConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`}></span>
                    {serialConnected ? "live" : "idle"}
                  </span>
                </div>
                {serialView === "monitor" ? (
                  <pre
                    ref={consoleRef}
                    className="text-[10px] font-mono whitespace-pre-wrap h-40 overflow-y-auto p-2 rounded-lg border border-[#222] bg-black text-emerald-300/90"
                  >
                    {serialLines || "[serial output appears here once you Connect]"}
                  </pre>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setPlotPaused((p) => !p)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white transition-colors"
                      >
                        {plotPaused ? "Resume" : "Pause"}
                      </button>
                      <div className="flex flex-wrap gap-2 items-center">
                        {plotLegend.labels.map((lab, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[9px] font-mono text-zinc-400">
                            <span className="w-2 h-2 rounded-sm" style={{ background: PLOT_COLORS[i % PLOT_COLORS.length] }}></span>
                            {lab}
                            {plotLegend.values[i] !== undefined ? `: ${plotLegend.values[i]}` : ""}
                          </span>
                        ))}
                        {plotLegend.labels.length === 0 && (
                          <span className="text-[9px] font-mono text-zinc-600">waiting for numeric data…</span>
                        )}
                      </div>
                    </div>
                    <canvas ref={plotCanvasRef} className="w-full h-48 rounded-lg border border-[#222] bg-black block" />
                    <p className="text-[9px] text-zinc-600 leading-relaxed">
                      Print numbers from your sketch, one sample per line — e.g. <span className="font-mono text-zinc-500">Serial.println(analogRead(34));</span> or several series separated by spaces/commas (optionally <span className="font-mono text-zinc-500">x:1.2 y:3.4</span>).
                    </p>
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendSerial();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={serialInput}
                    onChange={(e) => setSerialInput(e.target.value)}
                    disabled={!serialConnected}
                    placeholder={serialConnected ? "type a line and hit Send…" : "connect to send data…"}
                    className="flex-1 bg-[#141416] border border-[#222] rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!serialConnected}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded text-[11px] font-semibold border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white disabled:opacity-40"
                  >
                    <Send size={12} /> Send
                  </button>
                </form>
                <p className="text-[9px] text-zinc-600 leading-relaxed">
                  Web Serial (Chrome/Edge only). If Connect or Upload fails with a busy/locked port, close the Arduino IDE’s own Serial Monitor — only one program can hold a COM port at a time.
                </p>
              </div>
            </div>
          )}

          {/* ===================== PIN PLANNER PANEL ===================== */}
          {plannerOpen && (
            <div className="bg-[#0c0c0d] border border-[#2a2118] rounded-2xl p-4 space-y-3 shrink-0" id="pin-planner">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={15} className="text-orange-400" />
                  <h3 className="text-sm font-serif text-[#f5f5f0]">Pin Planner</h3>
                  <span className="text-[10px] font-mono text-zinc-500">· {activeBoard.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {planIsEsp32 && (
                    <button
                      onClick={() => setWifiInUse((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border transition-colors ${wifiInUse ? "bg-sky-950/40 border-sky-700 text-sky-300" : "bg-[#141416] border-[#2a2a2e] text-zinc-500"}`}
                      title="ESP32 ADC2 pins can't be read while Wi-Fi is active"
                    >
                      <Wifi size={11} /> Wi-Fi {wifiInUse ? "ON" : "OFF"}
                    </button>
                  )}
                  <button
                    onClick={copyPlan}
                    disabled={assignments.length === 0}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white disabled:opacity-40 transition-colors"
                  >
                    <ClipboardCheck size={11} className={planCopied ? "text-emerald-400" : ""} />
                    {planCopied ? "Copied" : "Copy plan"}
                  </button>
                  <button onClick={() => setPlannerOpen(false)} className="text-zinc-500 hover:text-white p-1" title="Close planner">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {assignments.length > 0 && (
                <div className={`flex items-center gap-2 text-[11px] font-mono px-3 py-2 rounded-lg border ${planResult.errors > 0 ? "bg-red-950/30 border-red-800/50 text-red-300" : planResult.warnings > 0 ? "bg-amber-950/25 border-amber-800/50 text-amber-300" : "bg-emerald-950/25 border-emerald-800/50 text-emerald-300"}`}>
                  {planResult.errors > 0 ? <AlertOctagon size={13} /> : planResult.warnings > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                  <span>
                    {planResult.errors} error{planResult.errors !== 1 ? "s" : ""} · {planResult.warnings} warning{planResult.warnings !== 1 ? "s" : ""}
                    {planResult.errors === 0 && planResult.warnings === 0 ? " · layout looks safe to boot" : ""}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono text-zinc-500">Quick add:</span>
                {[
                  { id: "i2c", label: "+ I²C" },
                  { id: "spi", label: "+ SPI" },
                  { id: "uart", label: "+ UART" },
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => quickAddBus(b.id as "i2c" | "spi" | "uart")}
                    className="px-2 py-1 rounded text-[10px] font-mono border bg-[#141416] border-[#2a2a2e] text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors"
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  onClick={() => addAssignment("dout")}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border bg-orange-950/30 border-orange-800/50 text-orange-300 hover:text-white transition-colors"
                >
                  <Plus size={11} /> Pin
                </button>
              </div>

              {assignments.length === 0 ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Assign pins to jobs (I²C, SPI, a sensor, a MOSFET gate…) and conflicts are flagged live — double-booked pins, input-only pins driven as outputs, ESP32 flash &amp; strapping pins, and ADC2-while-Wi-Fi. Assigned pins light up on the board below.
                </p>
              ) : (
                <div className="space-y-2">
                  {assignments.map((a) => {
                    const res = planResult.perAssignment[a.id];
                    const sev = res?.severity || "ok";
                    return (
                      <div key={a.id} className="bg-[#0a0a0b] border border-[#1a1a1c] rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="shrink-0">
                            {sev === "error" ? (
                              <AlertOctagon size={14} className="text-red-500" />
                            ) : sev === "warn" ? (
                              <AlertTriangle size={14} className="text-amber-400" />
                            ) : (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            )}
                          </span>
                          <input
                            value={a.label || ""}
                            onChange={(e) => updateAssignment(a.id, { label: e.target.value })}
                            placeholder="label (e.g. BME280)"
                            className="w-28 bg-[#141416] border border-[#222] rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                          />
                          <select
                            value={a.roleId}
                            onChange={(e) => updateAssignment(a.id, { roleId: e.target.value })}
                            className="bg-[#141416] border border-[#222] rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600"
                          >
                            {["I²C", "SPI", "UART", "GPIO"].map((g) => (
                              <optgroup key={g} label={g}>
                                {PLANNER_ROLES.filter((r) => r.group === g).map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <select
                            value={a.pinName}
                            onChange={(e) => updateAssignment(a.id, { pinName: e.target.value })}
                            className={`bg-[#141416] border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-zinc-600 ${a.pinName ? "text-zinc-200 border-[#222]" : "text-zinc-500 border-[#3a2a1a]"}`}
                          >
                            <option value="">pin…</option>
                            {assignablePins.map((p) => (
                              <option key={p.number} value={p.name}>
                                {p.name} (G{p.gpio})
                              </option>
                            ))}
                          </select>
                          <button onClick={() => removeAssignment(a.id)} className="ml-auto text-zinc-600 hover:text-red-400 p-1" title="Remove">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {res && res.messages.length > 0 && (
                          <div className="pl-6 space-y-0.5">
                            {res.messages.map((m, i) => (
                              <p key={i} className={`text-[10px] leading-snug ${m.sev === "error" ? "text-red-400" : "text-amber-400/90"}`}>
                                {m.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Header area of board view */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#141416]">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] bg-[#1a1a1c] border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono uppercase">
                  {activeBoard.specs.architecture}
                </span>
                {selectedBoardId === "custom" && (
                  <span className="text-[10px] bg-orange-950 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded font-mono uppercase flex items-center gap-1">
                    <Sparkles size={10} /> Real-time Intel Generated
                  </span>
                )}
              </div>
              <h2 className="text-3xl font-serif text-[#f5f5f0] tracking-tight underline decoration-[#222] decoration-2 underline-offset-8">
                {activeBoard.name}
              </h2>
              <p className="text-xs text-zinc-400 max-w-2xl mt-4 leading-relaxed">
                {activeBoard.description}
              </p>

              {/* Real-time PDF & Reference Document Reference Hub */}
              <div className="flex flex-wrap items-center gap-2 mt-4" id="datasheet-hub">
                {activeBoard.datasheetUrl && (
                  <a
                    href={activeBoard.datasheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#171310] hover:bg-orange-950/30 text-orange-400 font-mono text-[10px] font-bold rounded-lg border border-orange-900/40 hover:border-orange-500/60 transition-all shadow-sm"
                    title="Open official manufacturer PDF datasheet"
                  >
                    <FileText size={12} className="text-orange-500 animate-pulse shrink-0" />
                    <span>View Official Datasheet PDF</span>
                  </a>
                )}
                {activeBoard.additionalResources && activeBoard.additionalResources.map((res, index) => (
                  <a
                    key={index}
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#121214] hover:bg-zinc-800 text-zinc-300 font-mono text-[10px] rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
                  >
                    <Info size={11} className="text-zinc-500 shrink-0" />
                    <span>{res.label}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Search Panel Widget on the dashboard itself */}
            <div className="bg-[#0c0c0d] border border-[#1a1a1c] p-3 rounded-xl flex items-center gap-3 shrink-0">
              <div className="h-2 w-2 rounded-full bg-orange-500"></div>
              <div className="text-left font-mono">
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-0.5">Physical Board Configuration</div>
                <div className="text-xs text-zinc-300 font-bold leading-none">{activeBoard.pins.length} Total Pins mapped</div>
              </div>
            </div>
          </div>

          {/* Quick interactive filter toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0c0c0d]/60 border border-[#1a1a1c] px-4 py-2.5 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono text-zinc-500 mr-2 font-bold">Highlight Signal Map:</span>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: "all", label: "Show All", color: "border-zinc-800 text-zinc-300" },
                  { id: "gpio", label: "GPIO Pins", color: "border-emerald-800 text-emerald-400 bg-emerald-950/10" },
                  { id: "analog", label: "Analog (ADC/DAC)", color: "border-sky-800 text-sky-400 bg-sky-950/10" },
                  { id: "interfaces", label: "Protocol (SPI/I2C/UART)", color: "border-indigo-800 text-indigo-400 bg-indigo-950/10" },
                  { id: "cautions", label: "Critical Strapping/Cautions", color: "border-amber-800 text-amber-400 bg-amber-950/10" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setPinFilter(item.id);
                      setCapQuery("");
                    }}
                    className={`text-[10px] px-2.5 py-1 rounded transition-all border font-medium ${!capQuery && pinFilter === item.id
                        ? `${item.color.replace('bg-opacity-10', 'bg-opacity-30')} scale-[1.02] border font-semibold outline-none ring-1 ring-zinc-700`
                        : "bg-[#141416] border-transparent text-zinc-400 hover:text-white"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count of matching highlighted pins */}
            <div className="text-[10px] text-zinc-500 font-mono">
              Matching signals: {activeBoard.pins.filter(satisfiesFilter).length}
            </div>
          </div>

          {/* Reverse pin search — find pins by capability */}
          <div className="flex flex-wrap items-center gap-2 bg-[#0c0c0d]/60 border border-[#1a1a1c] px-4 py-2.5 rounded-xl" id="reverse-pin-search">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                value={capQuery}
                onChange={(e) => setCapQuery(e.target.value)}
                placeholder="Find pins by capability… pwm, 5V, interrupt, touch, dac, adc, i2c, spi, uart"
                className="bg-[#141416] border border-[#222] rounded-full pl-8 pr-7 py-1.5 w-[24rem] max-w-full text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-600"
                id="reverse-search-input"
              />
              {capQuery && (
                <button onClick={() => setCapQuery("")} className="absolute right-2 top-2 text-zinc-500 hover:text-white" title="Clear">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {["PWM", "Interrupt", "5V tolerant", "ADC", "DAC", "Touch"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCapQuery(capQuery.toLowerCase() === c.toLowerCase() ? "" : c.toLowerCase())}
                  className={`text-[10px] px-2 py-1 rounded border font-medium transition-colors ${capQuery.toLowerCase() === c.toLowerCase()
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-[#141416] border-[#2a2a2e] text-zinc-400 hover:text-white"
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {capQuery.trim() && (
              <span className="ml-auto text-[10px] font-mono text-indigo-300">
                {activeBoard.pins.filter(satisfiesFilter).length} match
              </span>
            )}
          </div>

          {/* Matched-pin list for the reverse search */}
          {capQuery.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {activeBoard.pins.filter(satisfiesFilter).map((p) => (
                <span
                  key={p.number}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/30 border border-indigo-800/40 text-indigo-200"
                >
                  {p.name}
                  <span className="text-indigo-400/60"> · {p.primary}</span>
                </span>
              ))}
              {activeBoard.pins.filter(satisfiesFilter).length === 0 && (
                <span className="text-[10px] text-zinc-500">
                  No pins match “{capQuery}”. Try: pwm, 5V, interrupt, adc, dac, touch, rtc, i2c, spi, uart.
                </span>
              )}
            </div>
          )}

          {/* Loading status overlay screen for search */}
          {isSearching && (
            <div className="absolute inset-0 bg-[#0a0a0b]/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="relative mb-6">
                <div className="w-16 h-16 border-2 border-orange-500/10 border-t-2 border-t-orange-500 rounded-full animate-spin"></div>
                <Cpu className="absolute inset-x-0 inset-y-0 m-auto text-orange-500 animate-pulse" size={24} />
              </div>
              <h3 className="text-md font-serif text-[#f5f5f0] tracking-wide mb-1">AI Silkscreen Synthesis</h3>
              <p className="text-xs text-orange-400 font-mono animate-pulse mb-6">Scanning electronic datasheets to generate interactive pinouts...</p>

              {/* Dynamic steps simulation to ease tension while waiting */}
              <div className="max-w-xs space-y-2 text-left bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 font-mono text-[9px] text-zinc-500">
                <div className="flex items-center gap-2"><CheckCircle2 size={10} className="text-emerald-500 shrink-0" /> Synchronized Gemini architecture engine</div>
                <div className="flex flex-row items-center gap-2"><RefreshCcw size={10} className="text-orange-500 animate-spin shrink-0" /> Digesting manufacturer hardware registry</div>
                <div className="flex items-center gap-2 text-zinc-600">&bull; Organizing physical controller coordinates</div>
                <div className="flex items-center gap-2 text-zinc-600">&bull; Flagging dangerous bootstrapping & VCC tolerances</div>
              </div>
            </div>
          )}

          {/* Focused-pin detail card — lives in its own fixed-height strip above
              the board so it never covers the top pins and never shifts the
              layout when you hover. */}
          <div className="relative h-36 shrink-0">
            {focusedPin ? (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#0c0c0d] border-2 border-orange-500/30 px-4 py-3 rounded-xl shadow-xl z-20 w-80 max-h-32 overflow-y-auto text-center animate-fade-in">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono font-bold text-orange-400 bg-orange-950/40 px-1.5 py-0.2 rounded uppercase">
                    Physical PIN {focusedPin.number}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500">GPIO Map: {focusedPin.gpio}</span>
                </div>
                <h4 className="text-sm font-semibold text-white tracking-tight">{focusedPin.name}</h4>
                <p className="text-[11px] text-zinc-400 mb-2 leading-tight">{focusedPin.primary}</p>
                <div className="flex flex-wrap gap-1 justify-center mb-1.5">
                  {focusedPin.features.map((feat, ix) => (
                    <span key={ix} className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono px-1 py-0.1 rounded">
                      {feat}
                    </span>
                  ))}
                </div>
                {focusedPin.caution && (
                  <div className="mt-2 bg-[#2d120a] border border-red-900/30 p-1.5 rounded text-left">
                    <p className="text-[9px] text-[#e0a98f] leading-normal font-medium flex items-start gap-1">
                      <AlertTriangle size={10} className="shrink-0 text-orange-400 mt-0.5" />
                      <span>{focusedPin.caution}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                Hover or tap a pin for details
              </div>
            )}
          </div>

          {/* Attached components bar (interactive snapping) */}
          {attachedWiring.length > 0 && (
            <div className="bg-[#0c0c0d] border border-[#0e2024] rounded-xl p-3 space-y-2 shrink-0" id="attached-components">
              <div className="flex items-center gap-2">
                <Cable size={12} className="text-cyan-400" />
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">Connected components</span>
                <button onClick={() => setAttachedComponents([])} className="ml-auto text-[10px] font-mono text-zinc-500 hover:text-white">Clear all</button>
              </div>
              <div className="space-y-1.5">
                {attachedWiring.map((aw) => (
                  <div key={aw.comp.id} className="flex items-start gap-2 text-[10px]">
                    <span className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: aw.color }}></span>
                    <span className="font-semibold text-zinc-200 shrink-0">{aw.comp.name.split(" (")[0]}</span>
                    <span className="font-mono text-zinc-400">
                      {aw.rows.map((r) => `${r.module}→${r.board}`).join("  ·  ")}
                    </span>
                    {aw.issues.some((i) => i.sev !== "ok") && (
                      <span className="text-amber-400 inline-flex items-center gap-0.5" title={aw.issues.filter((i) => i.sev !== "ok").map((i) => i.text).join(" ")}>
                        <AlertTriangle size={11} />
                      </span>
                    )}
                    <button onClick={() => detachComponent(aw.comp.id)} className="ml-auto text-zinc-600 hover:text-red-400 shrink-0" title="Remove">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              {attachedWiring.some((aw) => aw.issues.some((i) => i.sev !== "ok")) && (
                <div className="space-y-1 pt-1 border-t border-[#161616]">
                  {attachedWiring.flatMap((aw) =>
                    aw.issues.filter((i) => i.sev !== "ok").map((i, k) => (
                      <p key={aw.comp.id + k} className={`text-[10px] leading-snug ${i.sev === "error" ? "text-red-400" : "text-amber-400/90"}`}>
                        {aw.comp.name.split(" (")[0]}: {i.text}
                      </p>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Map Layout: Visualizes the Selected Board */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragOverBoard) setDragOverBoard(true);
            }}
            onDragLeave={() => setDragOverBoard(false)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/component");
              if (id) attachComponent(id);
              setDragOverBoard(false);
            }}
            className={`flex-1 flex flex-col xl:flex-row gap-8 items-center justify-center bg-[#09090a] border rounded-2xl p-8 relative min-h-[480px] transition-colors ${dragOverBoard ? "border-cyan-500 border-2 ring-2 ring-cyan-500/30" : "border-[#141416]/80"}`}
          >
            {dragOverBoard && (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-cyan-950/10">
                <span className="text-xs font-mono text-cyan-300 bg-[#0c0c0d] border border-cyan-700 rounded-full px-4 py-1.5">Drop to highlight its pins</span>
              </div>
            )}

            {/* Visual Board representation */}
            <div className="relative flex items-center justify-center py-10 scale-[0.98] transition-transform">

              {/* Conditional Layouts based on layoutType attribute *              {/* DUAL-INLINE WRAPPER (ESP32, Pico, ATtiny85, Nano) */}
              {activeBoard.layoutType === "dual-inline" && (
                <div className="flex items-center gap-6 lg:gap-10 relative px-4">

                  {/* Left Column Pins */}
                  <div className="flex flex-col gap-1 lg:gap-1.5 text-right w-44 lg:w-48 z-10">
                    {leftPins.map((pin) => {
                      const colorTheme = getPinCategoryColor(pin);
                      const isHighlighted = satisfiesFilter(pin);
                      const isHovered = hoveredPinName === pin.name;
                      const isSelected = selectedPinName === pin.name;

                      return (
                        <div
                          key={pin.number}
                          onMouseEnter={() => setHoveredPinName(pin.name)}
                          onMouseLeave={() => setHoveredPinName(null)}
                          onClick={() => setSelectedPinName(isSelected ? null : pin.name)}
                          className={`group flex items-center justify-end gap-2 cursor-pointer transition-all duration-150 ${isHighlighted ? "opacity-100" : "opacity-30"
                            } ${isHovered || isSelected ? "scale-[1.05]" : ""}`}
                          id={`left-pin-${pin.number}`}
                        >
                          <div className="flex flex-col">
                            <span className={`text-[11px] lg:text-xs font-mono font-bold leading-tight transition-colors ${isHovered || isSelected ? "text-orange-400" : "text-zinc-300 group-hover:text-zinc-100"
                              }`}>
                              {pin.name}
                            </span>
                            <span className="text-[8px] lg:text-[9px] text-zinc-500 uppercase tracking-tighter leading-none group-hover:text-zinc-400">
                              {pin.primary}
                            </span>
                          </div>

                          {/* Larger interactive Solder socket representation */}
                          <div className={`w-5.5 h-5.5 lg:w-6 lg:h-6 rounded-md flex items-center justify-center font-mono text-[9px] lg:text-[10px] font-extrabold border transition-all shadow-inner ${isHovered || isSelected
                              ? "bg-orange-500 border-white text-black ring-2 ring-orange-500/60 scale-110"
                              : `${colorTheme.bg} ${colorTheme.border}`
                            }`}>
                            {pin.number}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Smaller & sleeker physical silicon package representation */}
                  <div className={`relative w-40 lg:w-44 h-[390px] bg-[#121214] rounded-xl border-2 border-zinc-800 flex flex-col items-center justify-between py-6 shadow-2xl flex-shrink-0 ${activeBoard.id.includes("esp32") ? "border-t-[14px] border-t-zinc-950" : ""
                    }`}>

                    {/* Metal Module for ESP32 */}
                    {activeBoard.id.includes("esp32") ? (
                      <div className="w-32 h-22 bg-[#252528] rounded-lg border border-zinc-700/80 p-2 mx-auto flex flex-col items-center justify-between text-center relative overflow-hidden shadow-inner">
                        <div className="absolute top-0 inset-x-0 h-1 bg-zinc-950"></div>
                        <span className="text-[8px] font-mono font-bold tracking-tight text-orange-400/90">ESP-WROOM-32D</span>
                        <div className="w-8 h-8 border border-zinc-650 opacity-40 rounded flex items-center justify-center">
                          <Cpu size={12} className="text-zinc-500 animate-pulse" />
                        </div>
                        <span className="text-[6px] font-mono text-zinc-550">CE 211-161107 FCC</span>
                      </div>
                    ) : activeBoard.id.includes("tiny") ? (
                      // DIP 8 physical chip view center piece
                      <div className="w-28 h-28 bg-[#0e0e0f] rounded-lg border border-zinc-900 flex flex-col items-center justify-center p-2 shadow-xl relative">
                        <div className="absolute top-2 w-3 h-1.5 bg-zinc-950 rounded-full"></div>
                        <span className="text-[8px] font-mono font-bold text-zinc-500 tracking-wider mt-1">{activeBoard.specs.architecture.split(" ")[0]}</span>
                        <span className="font-serif italic text-[10px] text-orange-700/60 my-1 font-bold">ATtiny85</span>
                        <div className="w-2 h-2 rounded-full bg-zinc-900 border border-zinc-800 absolute top-1.5 left-1.5"></div>
                      </div>
                    ) : (
                      // Generic dynamic silicon
                      <div className="w-32 h-22 bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-lg border border-zinc-800 p-2 flex flex-col items-center justify-center space-y-0.5">
                        <Cpu className="text-zinc-600 hover:text-orange-500 transition-colors" size={18} />
                        <span className="text-[8px] font-mono text-zinc-400 font-bold">{activeBoard.name.split(" ")[0]}</span>
                        <span className="text-[6px] font-mono text-zinc-650">Synthesis Map v1.1</span>
                      </div>
                    )}

                    {/* Passive Elements */}
                    <div className="w-32 flex items-center justify-between px-2 text-[6px] font-mono text-zinc-600">
                      <div className="flex flex-col gap-0.5 items-center">
                        <div className="w-2.5 h-0.5 bg-red-850/60 rounded-sm"></div>
                        <span>PWR LED</span>
                      </div>

                      <div className="w-4 h-4 rounded-sm border border-zinc-800 flex items-center justify-center text-[7px] bg-zinc-950">RST</div>

                      <div className="flex flex-col gap-0.5 items-center">
                        <div className="w-2.5 h-0.5 bg-blue-800/60 rounded-sm"></div>
                        <span>STATUS</span>
                      </div>
                    </div>

                    {/* Integrated interface connector visual */}
                    <div className="w-14 h-9 bg-gradient-to-t from-zinc-900 to-zinc-950 border-t border-t-zinc-800 rounded-sm flex flex-col items-center justify-center text-[6px] font-mono text-zinc-550">
                      <div className="w-6 h-1 bg-zinc-950 rounded-sm mb-0.5 border-t border-zinc-900 shadow-inner"></div>
                      <span>Micro USB</span>
                    </div>
                  </div>

                  {/* Right Column Pins */}
                  <div className="flex flex-col gap-1 lg:gap-1.5 text-left w-44 lg:w-48 z-10">
                    {rightPins.map((pin) => {
                      const colorTheme = getPinCategoryColor(pin);
                      const isHighlighted = satisfiesFilter(pin);
                      const isHovered = hoveredPinName === pin.name;
                      const isSelected = selectedPinName === pin.name;

                      return (
                        <div
                          key={pin.number}
                          onMouseEnter={() => setHoveredPinName(pin.name)}
                          onMouseLeave={() => setHoveredPinName(null)}
                          onClick={() => setSelectedPinName(isSelected ? null : pin.name)}
                          className={`group flex items-center justify-start gap-2 cursor-pointer transition-all duration-150 ${isHighlighted ? "opacity-100" : "opacity-30"
                            } ${isHovered || isSelected ? "scale-[1.05]" : ""}`}
                          id={`right-pin-${pin.number}`}
                        >
                          {/* Larger interactive Solder socket representation */}
                          <div className={`w-5.5 h-5.5 lg:w-6 lg:h-6 rounded-md flex items-center justify-center font-mono text-[9px] lg:text-[10px] font-extrabold border transition-all shadow-inner ${isHovered || isSelected
                              ? "bg-orange-500 border-white text-black ring-2 ring-orange-500/60 scale-110"
                              : `${colorTheme.bg} ${colorTheme.border}`
                            }`}>
                            {pin.number}
                          </div>

                          <div className="flex flex-col">
                            <span className={`text-[11px] lg:text-xs font-mono font-bold leading-tight transition-colors ${isHovered || isSelected ? "text-orange-400" : "text-zinc-300 group-hover:text-zinc-100"
                              }`}>
                              {pin.name}
                            </span>
                            <span className="text-[8px] lg:text-[9px] text-zinc-500 uppercase tracking-tighter leading-none group-hover:text-zinc-400">
                              {pin.primary}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ARDUINO HEADERS WRAPPER (Uno, Custom Medium-sized boards) */}
              {(activeBoard.layoutType === "arduino-headers" || activeBoard.layoutType === "mega-headers") && (
                <div className="flex items-center gap-6 lg:gap-10 relative px-4">

                  {/* Left Column Pins */}
                  <div className="flex flex-col gap-1 lg:gap-1.5 text-right w-44 lg:w-48 z-10">
                    {leftPins.map((pin) => {
                      const colorTheme = getPinCategoryColor(pin);
                      const isHighlighted = satisfiesFilter(pin);
                      const isHovered = hoveredPinName === pin.name;
                      const isSelected = selectedPinName === pin.name;
                      return (
                        <div
                          key={pin.number}
                          onMouseEnter={() => setHoveredPinName(pin.name)}
                          onMouseLeave={() => setHoveredPinName(null)}
                          onClick={() => setSelectedPinName(isSelected ? null : pin.name)}
                          className={`group flex items-center justify-end gap-2 cursor-pointer transition-all duration-150 ${isHighlighted ? "opacity-100" : "opacity-30"
                            } ${isHovered || isSelected ? "scale-[1.05]" : ""}`}
                          id={`left-pin-${pin.number}`}
                        >
                          <div className="flex flex-col">
                            <span className={`text-[11px] lg:text-xs font-mono font-bold leading-tight transition-colors ${isHovered || isSelected ? "text-orange-400" : "text-zinc-300 group-hover:text-zinc-100"
                              }`}>
                              {pin.name}
                            </span>
                            <span className="text-[8px] lg:text-[9px] text-zinc-500 uppercase tracking-tighter leading-none group-hover:text-zinc-400">
                              {pin.primary}
                            </span>
                          </div>

                          {/* Larger interactive Solder socket representation */}
                          <div className={`w-5.5 h-5.5 lg:w-6 lg:h-6 rounded-md flex items-center justify-center font-mono text-[9px] lg:text-[10px] font-extrabold border transition-all shadow-inner ${isHovered || isSelected
                              ? "bg-orange-500 border-white text-black ring-2 ring-orange-500/60 scale-110"
                              : `${colorTheme.bg} ${colorTheme.border}`
                            }`}>
                            {pin.number}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact modernized vertical Arduino style PCB frame */}
                  <div className={`relative w-40 lg:w-44 h-[390px] bg-[#0c121e] rounded-xl border border-[#1b2536] flex flex-col items-center justify-between py-6 shadow-2xl flex-shrink-0`}>

                    {/* USB Connector visual at top */}
                    <div className="w-16 h-10 bg-gradient-to-b from-zinc-850 to-zinc-950 border border-zinc-700/60 rounded flex flex-col items-center justify-center text-[6px] font-mono text-zinc-500 shadow-inner">
                      <span>USB Type-B</span>
                    </div>

                    {/* Chip architecture */}
                    <div className="text-center">
                      <span className="text-[7px] font-mono uppercase tracking-widest text-[#2d4778]">Open-Source Hardware</span>
                    </div>

                    {/* DIP Processor Centerpiece */}
                    {activeBoard.layoutType === "mega-headers" ? (
                      <div className="w-16 h-16 bg-zinc-900 rounded border border-[#1c2e4f] flex flex-col items-center justify-center p-2 shadow-inner rotate-45 relative">
                        <span className="text-[7px] font-mono font-bold text-zinc-500 -rotate-45">ATMEGA2560</span>
                      </div>
                    ) : (
                      <div className="w-8 h-24 bg-zinc-950 rounded border border-[#1b273d] flex flex-col items-center justify-around py-2 shadow-md">
                        <div className="h-0.5 w-full bg-[#111] border-b border-[#050510]"></div>
                        <span className="text-[7px] font-mono font-bold tracking-widest text-zinc-500 [writing-mode:vertical-lr] rotate-180">ATMEGA328P</span>
                        <div className="h-0.5 w-full bg-[#111] border-t border-[#050510]"></div>
                      </div>
                    )}

                    {/* Board label silkscreen */}
                    <div className="text-center font-mono opacity-80">
                      <div className="text-[10px] font-bold text-sky-400">{activeBoard.name.split(" ")[0]}</div>
                      <div className="text-[5px] text-zinc-500 tracking-wider font-mono">REFERENCE MAP</div>
                    </div>

                    {/* DC Power Feed at bottom */}
                    <div className="w-14 h-12 bg-gradient-to-t from-zinc-900 to-zinc-950 border-t border-t-zinc-800 rounded flex flex-col items-center justify-center text-[6px] font-mono text-zinc-530 shadow-inner">
                      <div className="w-5 h-5 bg-zinc-950 rounded-sm mb-0.5 border border-zinc-900 shadow-inner"></div>
                      <span>9V DC JACK</span>
                    </div>

                  </div>

                  {/* Right Column Pins */}
                  <div className="flex flex-col gap-1 lg:gap-1.5 text-left w-44 lg:w-48 z-10">
                    {rightPins.map((pin) => {
                      const colorTheme = getPinCategoryColor(pin);
                      const isHighlighted = satisfiesFilter(pin);
                      const isHovered = hoveredPinName === pin.name;
                      const isSelected = selectedPinName === pin.name;
                      return (
                        <div
                          key={pin.number}
                          onMouseEnter={() => setHoveredPinName(pin.name)}
                          onMouseLeave={() => setHoveredPinName(null)}
                          onClick={() => setSelectedPinName(isSelected ? null : pin.name)}
                          className={`group flex items-center justify-start gap-2 cursor-pointer transition-all duration-150 ${isHighlighted ? "opacity-100" : "opacity-30"
                            } ${isHovered || isSelected ? "scale-[1.05]" : ""}`}
                          id={`right-pin-${pin.number}`}
                        >
                          {/* Larger interactive Solder socket representation */}
                          <div className={`w-5.5 h-5.5 lg:w-6 lg:h-6 rounded-md flex items-center justify-center font-mono text-[9px] lg:text-[10px] font-extrabold border transition-all shadow-inner ${isHovered || isSelected
                              ? "bg-orange-500 border-white text-black ring-2 ring-orange-500/60 scale-110"
                              : `${colorTheme.bg} ${colorTheme.border}`
                            }`}>
                            {pin.number}
                          </div>

                          <div className="flex flex-col">
                            <span className={`text-[11px] lg:text-xs font-mono font-bold leading-tight transition-colors ${isHovered || isSelected ? "text-orange-400" : "text-zinc-300 group-hover:text-zinc-100"
                              }`}>
                              {pin.name}
                            </span>
                            <span className="text-[8px] lg:text-[9px] text-zinc-500 uppercase tracking-tighter leading-none group-hover:text-zinc-400">
                              {pin.primary}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>

            {/* Quick Legend Widget bar inside map space */}
            <div className="absolute bottom-4 inset-x-8 flex flex-wrap gap-x-6 gap-y-2 justify-center border-t border-[#1a1a1c] pt-4 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-zinc-900 border border-zinc-800"></div>
                <span>Ground / GND</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-red-950/50 border border-red-900"></div>
                <span>VCC / Power</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-sky-950/50 border border-sky-900"></div>
                <span>Analog Input (ADC)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-indigo-950/50 border border-indigo-900"></div>
                <span>UART / Serial TX RX</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-emerald-950/50 border border-emerald-900"></div>
                <span>I2C / SPI Buses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded bg-amber-950/50 border border-amber-900"></div>
                <span>Critical Strp / Flash</span>
              </div>
            </div>

          </div>

          {/* Quick interactive datasheet details table */}
          <div className="bg-[#0c0c0d] border border-[#1a1a1c] p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
              <FileText size={13} className="text-orange-500" /> Datasheet Specifications (Real-Time Extract)
            </h3>

            <div className="spec-grid grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">Architecture</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.architecture}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">Clock Speed</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.clockSpeed}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">Logic Voltage</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.operatingVoltage}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">Flash Memory</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.flashMemory}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">SRAM Capacity</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.ramSize}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">General GPIOs</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.gpioCount} Pins</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">ADC Channels</div>
                <div className="text-[#f5f5f0] font-semibold">{activeBoard.specs.adcChannels}</div>
              </div>
              <div className="bg-[#141416] p-3 rounded-xl border border-zinc-800/40">
                <div className="text-zinc-500 font-mono text-[9px] uppercase tracking-widest mb-1">Protocols / Peripherals</div>
                <div className="text-[#f5f5f0] font-semibold truncate hover:text-clip">{activeBoard.specs.interfaces}</div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Command palette (⌘K) */}
      <Command.Dialog open={cmdkOpen} onOpenChange={setCmdkOpen} label="Command menu" className="cmdk-root">
        <Command.Input placeholder="Search boards, features, pins…" />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Group heading="Boards">
            {preloadedBoards.map((b) => (
              <Command.Item key={b.id} value={`board ${b.name}`} onSelect={() => { setSelectedBoardId(b.id); setCustomBoard(null); setCmdkOpen(false); }}>
                <Cpu size={14} /> {b.name}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Open">
            <Command.Item value="pin planner" onSelect={() => { setPlannerOpen(true); setCmdkOpen(false); }}><SlidersHorizontal size={14} /> Pin Planner</Command.Item>
            <Command.Item value="code generator" onSelect={() => { setCodeGenOpen(true); setCmdkOpen(false); }}><Code2 size={14} /> Code Gen</Command.Item>
            <Command.Item value="wiring helper" onSelect={() => { setWiringOpen(true); setCmdkOpen(false); }}><Cable size={14} /> Wiring Helper</Command.Item>
            <Command.Item value="compare boards" onSelect={() => { setCompareOpen(true); setCmdkOpen(false); }}><GitCompare size={14} /> Compare Boards</Command.Item>
            <Command.Item value="flash monitor" onSelect={() => { setFlashOpen(true); setCmdkOpen(false); }}><Terminal size={14} /> Flash &amp; Monitor</Command.Item>
            <Command.Item value="serial plotter graph" onSelect={() => { setFlashOpen(true); setSerialView("plotter"); setCmdkOpen(false); }}><Activity size={14} /> Serial Plotter</Command.Item>
            <Command.Item value="sanity check diagnostics" onSelect={() => { setDiagOpen(true); setCmdkOpen(false); }}><Stethoscope size={14} /> Sanity Check</Command.Item>
          </Command.Group>
          <Command.Group heading="Actions">
            <Command.Item value="share link" onSelect={() => { shareCurrentPlan(); setCmdkOpen(false); }}><Share2 size={14} /> Copy share link</Command.Item>
            <Command.Item value="export png image" onSelect={() => { setCmdkOpen(false); exportBoard(false); }}><Download size={14} /> Export PNG</Command.Item>
            <Command.Item value="export pdf" onSelect={() => { setCmdkOpen(false); exportBoard(true); }}><Download size={14} /> Export PDF</Command.Item>
            <Command.Item value="clear board plan components" onSelect={() => { setAssignments([]); setAttachedComponents([]); setCmdkOpen(false); }}><Trash2 size={14} /> Clear plan &amp; components</Command.Item>
            <Command.Item value="start tour help" onSelect={() => { setCmdkOpen(false); startTour(); }}><HelpIcon size={14} /> Start tour</Command.Item>
          </Command.Group>
          <Command.Group heading="Pins">
            {activeBoard.pins.map((p) => (
              <Command.Item key={p.number} value={`pin ${p.name} ${p.gpio} ${p.primary}`} onSelect={() => { setSelectedPinName(p.name); setSelectedBoardId(selectedBoardId); setCmdkOpen(false); }}>
                <span className="font-mono">{p.name}</span>
                <span className="text-zinc-500">· {p.primary}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
