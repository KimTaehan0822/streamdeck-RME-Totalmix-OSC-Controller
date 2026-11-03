// Shared Property Inspector code. Every PI loads sdpi-components.js, then this file, and contains
// <div data-global></div> where the connection settings should appear.
// Channel dropdowns: <sdpi-select setting="channel" datasource="getChannels:input"> (input | playback | output);
// add hot-reload so the list refreshes when TotalMix connects; select values arrive in settings as strings.
// The plugin answers the datasource request with the discovered channels (see src/plugin.ts).
// Folded by default: the connection is set once and only opened to check or change it.
const GLOBAL_BLOCK = `
<style>
	details.connection > summary { cursor: pointer; color: #969696; font-size: 9pt; padding: 4px 0 10px; user-select: none; }
	details.connection > summary:hover, details.connection > summary:focus-visible { color: #d8d8d8; }
	details.connection > summary:focus-visible { outline: 1px solid #708090; }
</style>
<details class="connection"><summary>TotalMix connection (OSC)</summary>
<sdpi-item label="Host"><sdpi-textfield setting="host" global default="127.0.0.1"></sdpi-textfield></sdpi-item>
<sdpi-item label="TotalMix port"><sdpi-textfield setting="targetPort" global default="7001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Feedback port"><sdpi-textfield setting="feedbackPort" global default="9001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Sync timeout (ms)"><sdpi-textfield setting="syncTimeoutMs" global default="500" pattern="^[0-9]{3,4}$"></sdpi-textfield></sdpi-item>
</details>`

for (const slot of document.querySelectorAll('[data-global]')) slot.innerHTML = GLOBAL_BLOCK

// Fields a page adds from script miss what sdpi picks up while the page loads: sdpi-select only sees options
// added after it is on the page, and saved settings only reach fields that existed at connect. Redo both.
async function initFields(root) {
	for (const s of root.querySelectorAll('sdpi-select')) s.append(...s.querySelectorAll('option'))
	await Promise.all([...root.querySelectorAll('[setting]')].map((e) => e.updateComplete))
	await SDPIComponents.streamDeckClient.getSettings()
}
