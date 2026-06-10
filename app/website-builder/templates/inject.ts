// ─── Inline Editor Inject Script ─────────────────────────────────────────────
// Returns a <script> HTML string that is injected into the template HTML when
// editMode is true. The script enables click-to-edit, postMessage communication,
// and hover/selection outlines.

export function getInjectScript(): string {
  return `<script>
(function() {
  'use strict';

  // ── Field mapping from class names ──────────────────────────────────────────
  var CLASS_TO_FIELD = {
    'wb-hero-headline':      'hero.headline',
    'wb-hero-subline':       'hero.subline',
    'wb-hero-cta':           'hero.cta',
    'wb-about-title':        'about.title',
    'wb-about-body':         'about.body',
    'wb-notice-title':       'notice.title',
    'wb-notice-body':        'notice.body',
    'wb-location-address':   'location.address',
    'wb-location-hours':     'location.hours',
    'wb-location-parking':   'location.parking',
    'wb-footer-tagline':     'footer.tagline',
  };

  // ── Assign data-wb / data-wb-bg / data-wb-icon attributes ──────────────────
  function assignAttributes() {
    // Generic wb-text elements with data-field
    var wbTexts = document.querySelectorAll('.wb-text[data-field]');
    for (var i = 0; i < wbTexts.length; i++) {
      var el = wbTexts[i];
      if (!el.hasAttribute('data-wb')) {
        el.setAttribute('data-wb', el.getAttribute('data-field'));
      }
    }

    // Named class → field mapping
    var classKeys = Object.keys(CLASS_TO_FIELD);
    for (var ci = 0; ci < classKeys.length; ci++) {
      var cls = classKeys[ci];
      var field = CLASS_TO_FIELD[cls];
      var els = document.querySelectorAll('.' + cls);
      for (var j = 0; j < els.length; j++) {
        if (!els[j].hasAttribute('data-wb')) {
          els[j].setAttribute('data-wb', field);
        }
      }
    }

    // Services: wb-svc-name, wb-svc-desc, wb-svc-icon
    var svcNames = document.querySelectorAll('.wb-svc-name');
    for (var n = 0; n < svcNames.length; n++) {
      svcNames[n].setAttribute('data-wb', 'services.' + n + '.name');
    }
    var svcDescs = document.querySelectorAll('.wb-svc-desc');
    for (var nd = 0; nd < svcDescs.length; nd++) {
      svcDescs[nd].setAttribute('data-wb', 'services.' + nd + '.desc');
    }
    var svcIcons = document.querySelectorAll('.wb-svc-icon');
    for (var ni = 0; ni < svcIcons.length; ni++) {
      svcIcons[ni].setAttribute('data-wb-icon', 'services.' + ni + '.icon');
    }

    // Doctors: wb-doc-name, wb-doc-title, wb-doc-bio
    var docNames = document.querySelectorAll('.wb-doc-name');
    for (var dn = 0; dn < docNames.length; dn++) {
      docNames[dn].setAttribute('data-wb', 'doctors.' + dn + '.name');
    }
    var docTitles = document.querySelectorAll('.wb-doc-title');
    for (var dt = 0; dt < docTitles.length; dt++) {
      docTitles[dt].setAttribute('data-wb', 'doctors.' + dt + '.title');
    }
    var docBios = document.querySelectorAll('.wb-doc-bio');
    for (var db = 0; db < docBios.length; db++) {
      docBios[db].setAttribute('data-wb', 'doctors.' + db + '.bio');
    }

    // Background sections: wb-bg with data-field
    var wbBgs = document.querySelectorAll('.wb-bg[data-field]');
    for (var bg = 0; bg < wbBgs.length; bg++) {
      var bgEl = wbBgs[bg];
      if (!bgEl.hasAttribute('data-wb-bg')) {
        bgEl.setAttribute('data-wb-bg', bgEl.getAttribute('data-field'));
      }
    }

    // Add cursor:pointer to all editable elements
    var allEditable = document.querySelectorAll('[data-wb],[data-wb-bg],[data-wb-icon]');
    for (var ae = 0; ae < allEditable.length; ae++) {
      allEditable[ae].style.cursor = 'pointer';
    }
  }

  // ── State ───────────────────────────────────────────────────────────────────
  var selectedEl = null;
  var HOVER_STYLE  = '2px dashed rgba(232,93,44,.6)';
  var SELECT_STYLE = '2px solid #E85D2C';

  function getEditType(el) {
    if (el.hasAttribute('data-wb-icon')) return 'icon';
    if (el.hasAttribute('data-wb-bg'))  return 'bg';
    if (el.tagName === 'IMG')            return 'img';
    return 'text';
  }

  function getField(el) {
    return el.getAttribute('data-wb') ||
           el.getAttribute('data-wb-bg') ||
           el.getAttribute('data-wb-icon') || '';
  }

  function getValue(el) {
    var type = getEditType(el);
    if (type === 'img') return el.getAttribute('src') || '';
    if (type === 'bg') {
      return window.getComputedStyle(el).backgroundColor || '';
    }
    if (type === 'icon') return el.textContent || '';
    return el.textContent || '';
  }

  function getComputedInfo(el) {
    try {
      var cs = window.getComputedStyle(el);
      return {
        color:      cs.color      || '#000000',
        fontSize:   parseFloat(cs.fontSize) || 16,
        fontWeight: cs.fontWeight || '400',
        bg:         cs.backgroundColor || 'transparent',
      };
    } catch(e) {
      return { color: '#000000', fontSize: 16, fontWeight: '400', bg: 'transparent' };
    }
  }

  function getRect(el) {
    try {
      var r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    } catch(e) {
      return { top: 0, left: 0, width: 0, height: 0 };
    }
  }

  function sendMsg(type, payload) {
    try {
      window.parent.postMessage({ _wb: 1, type: type, payload: payload || {} }, '*');
    } catch(e) {}
  }

  function clearOutlines() {
    var all = document.querySelectorAll('[data-wb],[data-wb-bg],[data-wb-icon]');
    for (var i = 0; i < all.length; i++) {
      all[i].style.outline = '';
    }
  }

  function selectElement(el) {
    if (selectedEl) {
      try { selectedEl.style.outline = ''; } catch(e) {}
    }
    selectedEl = el;
    el.style.outline = SELECT_STYLE;

    var field    = getField(el);
    var editType = getEditType(el);
    var value    = getValue(el);
    var rect     = getRect(el);
    var cs       = getComputedInfo(el);

    sendMsg('select', {
      field:         field,
      editType:      editType,
      value:         value,
      rect:          rect,
      computedStyle: cs,
    });
  }

  function deselectAll() {
    if (selectedEl) {
      try { selectedEl.style.outline = ''; } catch(e) {}
      selectedEl = null;
    }
    sendMsg('deselect', {});
  }

  // ── Event listeners ─────────────────────────────────────────────────────────
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.hasAttribute && (el.hasAttribute('data-wb') || el.hasAttribute('data-wb-bg') || el.hasAttribute('data-wb-icon'))) {
        if (el !== selectedEl) {
          el.style.outline = HOVER_STYLE;
        }
        return;
      }
      el = el.parentElement;
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.hasAttribute && (el.hasAttribute('data-wb') || el.hasAttribute('data-wb-bg') || el.hasAttribute('data-wb-icon'))) {
        if (el !== selectedEl) {
          el.style.outline = '';
        }
        return;
      }
      el = el.parentElement;
    }
  }, true);

  document.addEventListener('click', function(e) {
    var el = e.target;
    // Walk up to find the nearest editable ancestor
    while (el && el !== document.body) {
      if (el.hasAttribute && (el.hasAttribute('data-wb') || el.hasAttribute('data-wb-bg') || el.hasAttribute('data-wb-icon'))) {
        e.preventDefault();
        e.stopPropagation();
        selectElement(el);
        return;
      }
      el = el.parentElement;
    }
    // Clicked empty area
    deselectAll();
  }, true);

  document.addEventListener('dblclick', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute('data-wb') && getEditType(el) === 'text') {
        e.preventDefault();
        e.stopPropagation();
        selectElement(el);
        el.contentEditable = 'true';
        el.focus();
        // Place cursor at end
        try {
          var range = document.createRange();
          var sel   = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch(err) {}
        return;
      }
      el = el.parentElement;
    }
  }, true);

  document.addEventListener('blur', function(e) {
    var el = e.target;
    if (el.contentEditable === 'true') {
      var field = el.getAttribute('data-wb');
      var value = el.textContent || '';
      el.contentEditable = 'false';
      if (field) {
        sendMsg('change', { field: field, value: value });
      }
    }
  }, true);

  // ── Message listener (from parent) ──────────────────────────────────────────
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data._wb) return;
    var type    = e.data.type;
    var payload = e.data.payload || {};

    if (type === 'applyStyle') {
      var field = payload.field;
      var style = payload.style || {};
      // Find element by data-wb, data-wb-bg, or data-wb-icon
      var el = document.querySelector('[data-wb="' + field + '"],[data-wb-bg="' + field + '"],[data-wb-icon="' + field + '"]');
      if (!el) return;
      if (style.color)      el.style.color = style.color;
      if (style.fontSize)   el.style.fontSize = style.fontSize;
      if (style.fontWeight) el.style.fontWeight = style.fontWeight;
      if (style.bg) {
        // Background color
        el.style.backgroundColor = style.bg;
      }
      if (style.content !== undefined) {
        // Icon/text content change
        el.textContent = style.content;
      }
    }

    if (type === 'setText') {
      var field = payload.field;
      var el = document.querySelector('[data-wb="' + field + '"]');
      if (el) el.textContent = payload.value || '';
    }

    if (type === 'setImg') {
      var field = payload.field;
      var el = document.querySelector('[data-wb="' + field + '"]');
      if (!el) return;
      if (el.tagName === 'IMG') {
        el.src = payload.src || '';
      } else {
        el.style.backgroundImage = 'url("' + (payload.src || '') + '")';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }
    }

    if (type === 'deselect') {
      deselectAll();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', assignAttributes);
  } else {
    assignAttributes();
  }

})();
<\/script>`;
}
