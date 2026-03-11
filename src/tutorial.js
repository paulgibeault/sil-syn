/**
 * Tutorial — guided intro pages that teach players how the game works.
 */

export const TUTORIAL_PAGES = [
  {
    title: 'Welcome to Silicon Syndicate',
    body: `
<p>You are a hardware engineer programming <strong>microcontrollers (MCUs)</strong>
to solve logic puzzles.</p>
<p>Each level gives you a goal: produce the correct output signal on one or
more pins. You write assembly code to make the MCU do the work.</p>
<h3>How to play</h3>
<ul>
  <li>Read the level description to understand the goal</li>
  <li>Write code in the editor on the left</li>
  <li>Press <code>Run</code> to simulate, or <code>Step</code> to advance one cycle at a time</li>
  <li>Watch the waveform — green bars mean your output matches, red means mismatch</li>
</ul>
`,
  },
  {
    title: 'The MCU',
    body: `
<p>Each MCU is a tiny computer with:</p>
<h3>Registers</h3>
<ul>
  <li><code>acc</code> — the accumulator. Math operations work on this register.</li>
  <li><code>dat</code> — general-purpose storage. Use it to save values between cycles.</li>
</ul>
<h3>Pins</h3>
<ul>
  <li><code>p0</code>, <code>p1</code> — simple I/O pins. Read sensor values in, write results out.</li>
  <li><code>x0</code>, <code>x1</code> — XBus pins for synchronized data transfer between MCUs (advanced).</li>
</ul>
<h3>Execution</h3>
<p>Each simulation cycle, the MCU runs all your instructions from top to
bottom until it hits a <code>slp</code> (sleep) command or reaches the end of
the program. Then it waits until the next cycle and repeats.</p>
`,
  },
  {
    title: 'Instructions',
    body: `
<h3>Data Movement</h3>
<pre>mov [src] [dest]   Move a value between registers, pins, or literals
                   Example: mov 100 p0   (output 100 on pin p0)
                   Example: mov sensor acc (read sensor into acc)</pre>
<h3>Arithmetic</h3>
<pre>add [val]   acc = acc + val
sub [val]   acc = acc - val
mul [val]   acc = acc * val</pre>
<p>Values are clamped to the range -999 to 999.</p>
<h3>Testing &amp; Conditions</h3>
<pre>teq [a] [b]   Test if a equals b (sets condition flag)
tgt [a] [b]   Test if a is greater than b</pre>
<p>After a test, prefix lines with <code>+</code> to run only if true, or <code>-</code> to run only if false:</p>
<pre>tgt acc 50
+ mov acc p0    # runs if acc > 50
- mov 0 p0      # runs if acc <= 50</pre>
<p>You can also use <code>djt</code>/<code>djf</code> to jump to a label conditionally.</p>
`,
  },
  {
    title: 'Control Flow',
    body: `
<h3>Sleep</h3>
<pre>slp [N]   Sleep for N cycles. The MCU does nothing until it wakes.</pre>
<p>Use sleep to control timing. For example, to blink a light every 5
cycles, output 100, sleep 4, output 0, sleep 4, and loop.</p>
<h3>Labels &amp; Jumps</h3>
<pre>loop:        Define a label (put a colon after the name)
jmp loop     Jump to a label (unconditional)
djt label    Jump only if the last test was TRUE
djf label    Jump only if the last test was FALSE</pre>
<h3>Example: Blink</h3>
<pre>loop:
mov 100 p0
slp 4
mov 0 p0
slp 4
jmp loop</pre>
`,
  },
  {
    title: 'Understanding the Output',
    body: `
<h3>The Waveform</h3>
<p>The waveform display at the bottom shows your MCU's output over time:</p>
<ul>
  <li><strong>Dashed outlines</strong> — the expected output for each cycle</li>
  <li><strong>Green bars</strong> — your output matches the expected value</li>
  <li><strong>Red bars</strong> — your output is wrong for that cycle</li>
</ul>
<h3>Registers Panel</h3>
<p>Below the controls, you can see the MCU's current state:</p>
<ul>
  <li><code>acc</code> and <code>dat</code> — register values</li>
  <li><code>pc</code> — program counter (which instruction is next)</li>
  <li><code>state</code> — READY, SLEEPING, or blocked on XBus</li>
</ul>
<h3>Passing a Level</h3>
<p>When all cycles show green bars, you've passed! Your solutions are
saved automatically so you can revisit levels later.</p>
`,
  },
  {
    title: 'The Interface',
    body: `
<h3>Code Editor</h3>
<p>Type your assembly code directly, or tap the instruction buttons at the
bottom to insert commands. One instruction per line. Lines starting
with <code>#</code> are comments.</p>
<h3>Controls</h3>
<ul>
  <li><code>Run</code> — reset and simulate all cycles automatically</li>
  <li><code>Step</code> — advance one cycle at a time (great for debugging)</li>
  <li><code>Reset</code> — restart the simulation without clearing your code</li>
</ul>
<h3>Tips</h3>
<ul>
  <li>Use <code>Step</code> to watch how registers change each cycle</li>
  <li>Pay attention to the <code>pc</code> counter to see which instruction runs next</li>
  <li>The program wraps around — when it reaches the end, it starts over next cycle</li>
  <li>Press <code>?</code> anytime to return to this guide</li>
</ul>
<p style="color: var(--yellow); margin-top: 12px;">Good luck, engineer. The circuits await.</p>
`,
  },
];
