// Shared Property Inspector code. Every PI loads sdpi-components.js, then this file, and contains
// <div data-global></div> where the connection settings should appear.
// Channel dropdowns: <sdpi-select setting="channel" datasource="getChannels:input"> (input | playback | output);
// add hot-reload so the list refreshes when TotalMix connects; select values arrive in settings as strings.
// The plugin answers the datasource request with the discovered channels (see src/plugin.ts).
const GLOBAL_BLOCK = `
<sdpi-item label="Host"><sdpi-textfield setting="host" global default="127.0.0.1"></sdpi-textfield></sdpi-item>
<sdpi-item label="TotalMix port"><sdpi-textfield setting="targetPort" global default="7001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Feedback port"><sdpi-textfield setting="feedbackPort" global default="9001" pattern="^[0-9]{1,5}$"></sdpi-textfield></sdpi-item>
<sdpi-item label="Sync timeout (ms)"><sdpi-textfield setting="syncTimeoutMs" global default="500" pattern="^[0-9]{3,4}$"></sdpi-textfield></sdpi-item>`

for (const slot of document.querySelectorAll('[data-global]')) slot.innerHTML = GLOBAL_BLOCK

// Fields a page adds from script miss the settings sdpi received at connect; request them again once they exist.
async function loadSettings(root) {
	await Promise.all([...root.querySelectorAll('[setting]')].map((e) => e.updateComplete))
	await SDPIComponents.streamDeckClient.getSettings()
}
