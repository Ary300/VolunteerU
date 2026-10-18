/* The moment Finish or Skip ran on the onboarding screen. The route guard in
   components/Providers.jsx lets that screen navigate on its own only right
   after one of those presses. Any other visit to /onboarding by a finished
   account (browser Back, a typed URL, a Get started link) is sent on. */
let finishedAt = 0;
const WINDOW_MS = 10000;

export function markOnboardingFinished() {
  finishedAt = Date.now();
}

export function onboardingJustFinished() {
  return finishedAt > 0 && Date.now() - finishedAt < WINDOW_MS;
}

export function clearOnboardingFinished() {
  finishedAt = 0;
}
