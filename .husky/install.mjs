// Runs as the root `prepare` script. Production installs (the service images) have no
// devDependencies and no git checkout, so there are no hooks to install there.
if (process.env.NODE_ENV !== 'production') {
  const { default: husky } = await import('husky');
  const message = husky();
  if (message) console.log(message);
}
