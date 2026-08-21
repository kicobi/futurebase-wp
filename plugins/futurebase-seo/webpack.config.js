/**
 * Promotion-safe companion SEO build configuration.
 */

const baseConfig = require( '@wordpress/scripts/config/webpack.config' );

const marker = '__compseo_text_domain__';
const pluginDir = process.env.COMPSEO_PLUGIN_DIR;
const textDomain = process.env.COMPSEO_TEXT_DOMAIN;

if ( ! pluginDir || ! textDomain || ! /^[a-z0-9-]+$/.test( textDomain ) ) {
	throw new Error( 'The companion SEO build requires a safe text domain.' );
}

/**
 * Replace the source-only marker after optimization. This keeps minification
 * deterministic across promotion while preserving the renamed runtime domain.
 */
class CompanionSeoTextDomainPlugin {
	apply( compiler ) {
		compiler.hooks.thisCompilation.tap(
			'CompanionSeoTextDomainPlugin',
			( compilation ) => {
				compilation.hooks.processAssets.tap(
					{
						name: 'CompanionSeoTextDomainPlugin',
						stage: compiler.webpack.Compilation
							.PROCESS_ASSETS_STAGE_REPORT,
					},
					( assets ) => {
						let replacements = 0;

						Object.entries( assets ).forEach(
							( [ name, asset ] ) => {
								if ( ! name.endsWith( '.js' ) ) {
									return;
								}

								const source = asset.source().toString();
								if ( ! source.includes( marker ) ) {
									return;
								}

								const output = source.replaceAll(
									marker,
									textDomain
								);
								replacements += 1;
								compilation.updateAsset(
									name,
									new compiler.webpack.sources.RawSource(
										output
									)
								);
							}
						);

						if ( replacements === 0 ) {
							compilation.errors.push(
								new Error(
									'The companion SEO text-domain marker was not emitted.'
								)
							);
						}
					}
				);
			}
		);
	}
}

module.exports = {
	...baseConfig,
	plugins: [ ...baseConfig.plugins, new CompanionSeoTextDomainPlugin() ],
};
