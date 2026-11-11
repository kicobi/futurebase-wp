import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the shipped bundle, including immediately after a dependency-free
// rename. PHP runtime tests cannot detect a stale JS binding/global identity.
const copyrightTest = existsSync('inc/copyright.php') ? test : test.skip;
copyrightTest('compiled copyright binding follows theme identity and edited site title', () => {
	const slug = readFileSync('style.css', 'utf8').match(/^Text Domain:\s*(\S+)/m)[1];
	const configKey = `${slug.replaceAll('-', '_')}_copyright`;
	let binding;
	const window = {
		[configKey]: { format: '%1$s %2$s', year: '2099', title: 'Saved title' },
		wp: {
			blocks: { registerBlockBindingsSource: (source) => { binding = source; } },
			coreData: { store: {} },
			escapeHtml: { escapeHTML: (text) => `escaped:${text}` },
			i18n: {
				__: (text, domain) => { assert.equal(domain, slug); return text; },
				sprintf: (format, year, title) => format.replace('%1$s', year).replace('%2$s', title),
			},
		},
	};
	runInNewContext(readFileSync('build/editor.js', 'utf8'), { window });
	assert.equal(binding.name, `${slug}/copyright`);
	assert.equal(binding.setValues, undefined);
	const values = (title) => binding.getValues({ select: () => ({ getEditedEntityRecord: () => title === undefined ? undefined : { title } }) });
	assert.equal(values('Edited title').content, 'escaped:2099 Edited title');
	assert.equal(values('').content, 'escaped:2099 ');
	assert.equal(values(undefined).content, 'escaped:2099 Saved title');
});
