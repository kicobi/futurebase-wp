// Paths relative to .project/. Keep scanning and generated Git exclusions aligned.
const ROOT_PRIVATE = ['private', 'credentials', 'auth'];

export const PROJECT_PRIVATE_IGNORES = [
	...ROOT_PRIVATE.map((name) => `.project/${name}/`),
	'.project/**/raw-private/',
];

export function isPrivateProjectPath(relativePath) {
	const parts = relativePath.split('/');
	return ROOT_PRIVATE.includes(parts[0]) || parts.includes('raw-private');
}
