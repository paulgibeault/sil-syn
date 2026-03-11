Designing a **Shenzhen I/O** clone for the mobile web is a brilliant challenge. To meet your requirements for battery efficiency and mobile responsiveness, we’ll move away from a constant 60 FPS "game loop" and adopt an **Event-Driven Rendering** model.  
Here is the blueprint for **"Silicon Syndicate,"** a serverless, single-file logic puzzle game.

## **1\. Game Rules & Architecture**

### **The Hardware**

The game board is a grid where players place **Components**. Components are connected by **Wires** (traces).

* **Microcontrollers (MCUs):** The core units where you write code. They have 2–4 "Simple" pins (0–100 value) and 2 "XBus" pins (packetized data).  
* **Registers:** Each MCU has an acc (accumulator) and dat (data) register.  
* **Input/Output:** Levels provide "Source" pins (sensors) and "Sink" pins (displays/actuators). You must match the required output wave within a set number of cycles.

### **The Instruction Set (Simplified Assembly)**

To keep mobile typing easy, we'll use a 3-letter mnemonic system:

* mov \[src\] \[dest\] – Move value.  
* add \[val\], sub \[val\] – Math on acc.  
* teq \[a\] \[b\] – Test Equality (sets \+ or \- flags).  
* tgt \[a\] \[b\] – Test Greater Than.  
* jmp \[label\], djt \[label\] – Jump or Conditional Jump.  
* slp \[cycles\] – Sleep/Wait (Essential for timing).

## **2\. Level Design Progression**

| Level | Objective | New Concept Introduced |
| :---- | :---- | :---- |
| **01: Power On** | Constant signal of 100 to a light. | mov, Simple Pins. |
| **02: Blink** | Toggle a light every 5 cycles. | slp, jmp, Labels. |
| **03: Amplifier** | Read from Sensor A, multiply by 2, output to B. | add, acc register. |
| **04: Gatekeeper** | Only pass values \> 50; otherwise output 0\. | tgt, Conditional execution (+/-). |
| **05: Packet Sorter** | Read XBus packets; send even to P1, odd to P2. | XBus (blocking IO), Modulo logic. |

## **3\. Software Specifications**

### **Responsive Board Scaling**

Instead of a fixed pixel width, use a **Relative Grid Coordinate System**.

* **Portrait:** Stack the "Component Tray" at the bottom and the "Code Editor" in the middle.  
* **Landscape:** Component Tray on the left, Code Editor on the right, Board in the center.  
* **Implementation:** Use window.innerWidth/innerHeight inside a resize listener to recalculate cellSize. All drawing coordinates should be x \* cellSize.

### **Battery-Saving Engine (Dirty Flag Pattern)**

Most games redraw 60 times a second. For a logic puzzle, that's a waste of 99% of the battery.

* **The "Dirty" Flag:** Create a needsRedraw boolean.  
* **Triggering:** Set needsRedraw \= true **only** when:  
  1. The user touches/drags a component.  
  2. The user types a character.  
  3. The "Simulation Step" advances.  
* **The Loop:** \`\`\`javascript function loop() { if (needsRedraw) { drawBoard(); needsRedraw \= false; } requestAnimationFrame(loop); }

### **Mobile-Friendly Input**

* **No Keyboard Needed:** Instead of a physical keyboard, use a "Code Drawer" containing common instructions (mov, slp, acc). Tapping them inserts them into the active line.  
* **Touch Targets:** Ensure pins and wires have a hit-box of at least **44x44px**, even if the visual asset is smaller.  
* **Long-Press:** Use contextmenu or a long-press timer to delete components or wires.

## **4\. Implementation Strategy**

### **Technical Stack**

* **State Management:** A single gameState object containing an array of placedComponents.  
* **Execution Engine:** A generator function \*step() for each MCU. This allows the game to "pause" execution naturally between cycles.  
* **Storage:** Save progress and code solutions in localStorage.

### **Data Structure Example**

`const mcu = {`  
  `type: 'MCU_4PIN',`  
  `code: ['mov p0 acc', 'add 10', 'mov acc p1', 'slp 1'],`  
  `registers: { acc: 0, dat: 0 },`  
  `pc: 0, // Program Counter`  
  `sleepTimer: 0`  
`};`

**Would you like me to generate the foundational HTML/JavaScript boilerplate for the "Dirty Flag" rendering loop and the basic MCU execution engine?**