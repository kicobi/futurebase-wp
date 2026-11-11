( function () {
	'use strict';

	// Follow core's actual toggle visibility instead of a separate breakpoint.
	// When desktop navigation replaces the toggle, close through core so its
	// dialog state, focus handling, and document scroll lock stay in sync.
	const navigation = document.querySelector(
		'.site-header .wp-block-navigation'
	);
	const opener = navigation?.querySelector(
		'.wp-block-navigation__responsive-container-open'
	);
	if ( opener ) {
		const observer = new window.ResizeObserver( () => {
			if (
				! opener.getClientRects().length &&
				navigation.querySelector( '.is-menu-open' )
			) {
				navigation
					.querySelector(
						'.wp-block-navigation__responsive-container-close'
					)
					?.click();
			}
		} );
		observer.observe( opener );
	}

	// Style password protected post form.
	const passwordButton = document.querySelector(
		'.post-password-form [type="submit"]'
	);
	if ( document.body.contains( passwordButton ) ) {
		const passwordButtonWrapper = document.createElement( 'div' );
		passwordButtonWrapper.classList.add( 'wp-block-button' );
		passwordButton.parentNode.insertBefore(
			passwordButtonWrapper,
			passwordButton
		);
		passwordButtonWrapper.appendChild( passwordButton );

		passwordButton.classList.add( 'wp-block-button__link' );
	}
} )();
