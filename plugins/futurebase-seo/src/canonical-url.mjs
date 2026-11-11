/**
 * Accept the same authored canonical forms as the PHP URL validator.
 *
 * @param {string} input Authored canonical URL.
 * @return {boolean} Whether the URL can be saved.
 */
export const isValidCanonical = ( input ) => {
	const value = input.trim();
	if ( ! value ) {
		return true;
	}
	if (
		! /^https?:\/\//i.test( value ) ||
		/[\u0000-\u001f\u007f\\#]/.test( value ) ||
		/^https?:\/\/[^/?#]*@/i.test( value )
	) {
		return false;
	}
	try {
		const parsed = new URL( value );
		return !! parsed.hostname && ! parsed.username && ! parsed.password;
	} catch {
		return false;
	}
};
