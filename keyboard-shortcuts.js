/**
 * DUCAR Priority Studio — Standalone Keyboard Shortcuts Engine
 * Keyboard bindings:
 * - Ctrl/Cmd+K or F: Focus search box
 * - Esc: Clear focus / close active modal or help panel
 * - Left/Right Arrow keys: Step between active visible navigation tabs
 * - ? (Shift+/): Toggle shortcuts help modal card
 */

(function () {
  'use strict';

  function ensureHelpModal() {
    if (document.getElementById('keyboard-shortcuts-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'keyboard-shortcuts-modal';
    modal.hidden = true;
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
    modal.style.backdropFilter = 'blur(8px)';
    modal.style.zIndex = '999999';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.display = 'none'; // Only display flex when active to prevent stray blocking!

    modal.innerHTML = `
      <div style="background: #0f172a; border: 1px solid #00f3ff; border-radius: 16px; width: 460px; max-width: 90vw; padding: 24px; color: #fff; box-shadow: 0 0 30px rgba(0,243,255,0.3); font-family: Inter, system-ui, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; margin-bottom: 16px;">
          <h3 style="margin: 0; color: #00f3ff; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
            <span style="background: rgba(0,243,255,0.2); padding: 4px 8px; border-radius: 6px;">⌨</span> Keyboard Shortcuts
          </h3>
          <button id="close-shortcuts-btn" style="background: none; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; padding: 0 4px;">&times;</button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.88rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #cbd5e1;">Focus Search Box</span>
            <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #00ff66; font-family: monospace;">Ctrl + K</kbd> or <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #00ff66; font-family: monospace;">F</kbd>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #cbd5e1;">Switch Between Tabs</span>
            <div>
              <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #ff00ea; font-family: monospace;">&larr;</kbd> / <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #ff00ea; font-family: monospace;">&rarr;</kbd>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #cbd5e1;">Clear Focus / Close Modal</span>
            <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #ff9900; font-family: monospace;">Esc</kbd>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #cbd5e1;">Toggle Shortcuts Help</span>
            <kbd style="background: #1e293b; border: 1px solid #334155; padding: 3px 8px; border-radius: 6px; color: #00f3ff; font-family: monospace;">?</kbd>
          </div>
        </div>

        <div style="margin-top: 20px; text-align: right;">
          <button id="dismiss-shortcuts-btn" style="background: rgba(0,243,255,0.15); border: 1px solid #00f3ff; color: #00f3ff; padding: 6px 16px; border-radius: 8px; cursor: pointer; font-weight: 600;">Got It</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('close-shortcuts-btn');
    const dismissBtn = document.getElementById('dismiss-shortcuts-btn');
    if (closeBtn) closeBtn.onclick = toggleHelpModal;
    if (dismissBtn) dismissBtn.onclick = toggleHelpModal;
    modal.onclick = function (e) {
      if (e.target === modal) toggleHelpModal();
    };
  }

  function toggleHelpModal() {
    ensureHelpModal();
    const modal = document.getElementById('keyboard-shortcuts-modal');
    if (!modal) return;
    const isHidden = modal.hidden || modal.style.display === 'none';
    if (isHidden) {
      modal.hidden = false;
      modal.style.display = 'flex';
    } else {
      modal.hidden = true;
      modal.style.display = 'none';
    }
  }

  function focusSearchBox() {
    const searchInputs = document.querySelectorAll('input[type="search"], input[type="text"], .search-input, #search-input, input[placeholder*="Search"]');
    for (let input of searchInputs) {
      if (input.offsetWidth > 0 && input.offsetHeight > 0) {
        input.focus();
        if (input.select) input.select();
        return true;
      }
    }
    return false;
  }

  function navigateTabs(direction) {
    const tabs = Array.from(document.querySelectorAll('button[role="tab"], .nav-item, .tab-btn, .nav-link, button.tab')).filter(t => t.offsetWidth > 0 && t.offsetHeight > 0);
    if (tabs.length === 0) return;

    let activeIdx = tabs.findIndex(t => t.classList.contains('active') || t.getAttribute('aria-selected') === 'true' || t.style.backgroundColor?.includes('255'));
    if (activeIdx === -1) activeIdx = 0;

    let nextIdx = activeIdx + direction;
    if (nextIdx < 0) nextIdx = tabs.length - 1;
    if (nextIdx >= tabs.length) nextIdx = 0;

    tabs[nextIdx].click();
  }

  window.addEventListener('keydown', function (e) {
    const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      if (!isInputActive) {
        e.preventDefault();
        toggleHelpModal();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      focusSearchBox();
      return;
    }
    if (e.key.toLowerCase() === 'f' && !isInputActive && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      focusSearchBox();
      return;
    }

    if (e.key === 'Escape') {
      const modal = document.getElementById('keyboard-shortcuts-modal');
      if (modal && (!modal.hidden && modal.style.display !== 'none')) {
        e.preventDefault();
        toggleHelpModal();
        return;
      }
      if (document.activeElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (!isInputActive && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateTabs(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateTabs(1);
      }
    }
  });

  window.DUCARKeyboardShortcuts = {
    toggleHelpModal: toggleHelpModal,
    focusSearch: focusSearchBox
  };

  console.log("✓ DUCAR Keyboard Shortcuts Module Initialized");
})();
