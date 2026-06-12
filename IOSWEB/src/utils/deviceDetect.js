export const isIOS = () => {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
  // iPad on iOS 13 detection
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
};

export const isStandalone = () => {
  return ('standalone' in window.navigator && window.navigator.standalone) ||
         window.matchMedia('(display-mode: standalone)').matches;
};
