(() => {
  const isInjectedAttribute = (name) =>
    name.startsWith("bis_") ||
    (name.startsWith("__processed_") && name.endsWith("__"));

  const cleanElement = (element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (isInjectedAttribute(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  };

  const cleanTree = (root) => {
    if (!(root instanceof Element)) return;

    cleanElement(root);
    root.querySelectorAll("*").forEach(cleanElement);
  };

  cleanTree(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName &&
        isInjectedAttribute(mutation.attributeName)
      ) {
        mutation.target.removeAttribute(mutation.attributeName);
        continue;
      }

      mutation.addedNodes.forEach(cleanTree);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  window.setTimeout(() => observer.disconnect(), 10000);
})();
