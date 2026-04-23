/**
 * VizionOne Professional Hand Cleaner — Landing Page JS
 * assets/landing.js
 *
 * Responsibilities:
 * 1. Reveal JS-enhanced pricing UI
 * 2. Sync pricing card selection with the product form
 * 3. Add items to cart via Shopify AJAX API
 * 4. Keep header cart counts and cart drawer in sync
 * 5. Support cart drawer quantity updates and removal
 * 6. Toggle mobile navigation reliably
 * 7. Handle sticky buy bar, FAQ accordion, and smooth scroll
 */

(function () {
  'use strict';

if (window.__v1LandingInitialized && !window.Shopify?.designMode) {
  return;
}
window.__v1LandingInitialized = true;

  var FETCH_TIMEOUT_MS = 10000;
  var DRAWER_TRANSITION_MS = 250;
  var CART_JS_URL = '/cart.js';
  var CART_ADD_URL = '/cart/add.js';
  var CART_CHANGE_URL = '/cart/change.js';

  var doc = document;
  var body = doc.body;

  var cartDrawer = doc.querySelector('[data-cart-drawer]');
  var cartDrawerOverlay = cartDrawer ? cartDrawer.querySelector('[data-cart-overlay]') : null;
  var cartDrawerItems = cartDrawer ? cartDrawer.querySelector('[data-cart-items]') : null;
  var cartDrawerEmpty = cartDrawer ? cartDrawer.querySelector('[data-cart-empty]') : null;
  var cartDrawerTotal = cartDrawer ? cartDrawer.querySelector('[data-cart-total]') : null;
  var cartDrawerStatus = cartDrawer ? cartDrawer.querySelector('[data-cart-status]') : null;
  var cartDrawerLoading = cartDrawer ? cartDrawer.querySelector('[data-cart-loading]') : null;
  var cartDrawerCheckout = cartDrawer ? cartDrawer.querySelector('[data-cart-checkout]') : null;
  var cartDrawerCloseControls = cartDrawer ? cartDrawer.querySelectorAll('[data-cart-close]') : [];
  var cartToggles = doc.querySelectorAll('[data-cart-toggle]');
  var cartCountBadges = doc.querySelectorAll('[data-cart-count]');
  var cartCurrencyCode = cartDrawer ? cartDrawer.getAttribute('data-currency-code') || 'USD' : 'USD';
  var activeCartTrigger = null;
  var cartIsBusy = false;

  var mobileMenus = [];

  /* ============================================================
     Helpers
  ============================================================ */

  function fetchWithTimeout(url, options) {
    return Promise.race([
      fetch(url, options),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('timeout'));
        }, FETCH_TIMEOUT_MS);
      })
    ]);
  }

  function parseJsonResponse(response, fallbackMessage) {
    if (response.ok) {
      return response.json();
    }

    return response
      .json()
      .catch(function () {
        return {};
      })
      .then(function (data) {
        throw new Error(data.description || data.message || fallbackMessage);
      });
  }

  function requestJson(url, options, fallbackMessage) {
    return fetchWithTimeout(url, options).then(function (response) {
      return parseJsonResponse(response, fallbackMessage);
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(cents, currencyCode) {
    var amount = (Number(cents) || 0) / 100;

    try {
      return new Intl.NumberFormat(doc.documentElement.lang || 'en-US', {
        style: 'currency',
        currency: currencyCode || cartCurrencyCode || 'USD'
      }).format(amount);
    } catch (error) {
      return '$' + amount.toFixed(2);
    }
  }

  function withSizedImage(url, width) {
    if (!url) return '';
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + width;
  }

  function setCartStatus(message) {
    if (!cartDrawerStatus) return;

    cartDrawerStatus.textContent = message || '';
    cartDrawerStatus.hidden = !message;
  }

  function setCartLoading(isLoading) {
    if (!cartDrawer || !cartDrawerLoading) return;

    cartDrawerLoading.hidden = !isLoading;
    cartDrawer.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  function setCartBusy(isBusy) {
    cartIsBusy = isBusy;

    if (!cartDrawer) return;

    cartDrawer
      .querySelectorAll('[data-cart-quantity-change], [data-cart-remove]')
      .forEach(function (control) {
        control.disabled = isBusy;
      });
  }

  function updateCartToggleState(isOpen) {
    cartToggles.forEach(function (toggle) {
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  function updateCartCount(count) {
    cartCountBadges.forEach(function (badge) {
      badge.textContent = count;
      badge.hidden = count < 1;
    });
  }

  function getCurrentCartCount() {
    if (!cartCountBadges.length) {
      return 0;
    }

    return parseInt(cartCountBadges[0].textContent || '0', 10) || 0;
  }

  function renderCartItem(item) {
    var title = escapeHtml(item.product_title || item.title);
    var variantTitle = item.variant_title && item.variant_title !== 'Default Title'
      ? '<p class="cart-drawer__item-variant">' + escapeHtml(item.variant_title) + '</p>'
      : '';
    var imageUrl = withSizedImage(
      (item.featured_image && item.featured_image.url) || item.image || '',
      160
    );
    var imageMarkup = imageUrl
      ? '<img class="cart-drawer__item-image" src="' +
          escapeHtml(imageUrl) +
          '" alt="' +
          title +
          '">'
      : '';
    var removeLabel = 'Remove ' + (item.product_title || item.title || 'item') + ' from cart';
    var decreaseLabel = item.quantity <= 1
      ? removeLabel
      : 'Decrease quantity of ' + (item.product_title || item.title || 'item');
    var increaseLabel = 'Increase quantity of ' + (item.product_title || item.title || 'item');

    return (
      '<article class="cart-drawer__item">' +
        '<div class="cart-drawer__item-image-wrap">' + imageMarkup + '</div>' +
        '<div class="cart-drawer__item-content">' +
          '<div class="cart-drawer__item-title-row">' +
            '<h3 class="cart-drawer__item-title">' + title + '</h3>' +
            '<p class="cart-drawer__item-price">' + formatMoney(item.final_line_price, cartCurrencyCode) + '</p>' +
          '</div>' +
          variantTitle +
          '<div class="cart-drawer__item-controls">' +
            '<div class="cart-drawer__qty" aria-label="Quantity">' +
              '<button type="button" class="cart-drawer__qty-btn" data-cart-quantity-change data-key="' +
                escapeHtml(item.key) +
                '" data-quantity="' +
                Math.max(item.quantity - 1, 0) +
                '" aria-label="' +
                escapeHtml(decreaseLabel) +
                '">-</button>' +
              '<span class="cart-drawer__qty-value">' + item.quantity + '</span>' +
              '<button type="button" class="cart-drawer__qty-btn" data-cart-quantity-change data-key="' +
                escapeHtml(item.key) +
                '" data-quantity="' +
                (item.quantity + 1) +
                '" aria-label="' +
                escapeHtml(increaseLabel) +
                '">+</button>' +
            '</div>' +
            '<button type="button" class="cart-drawer__remove" data-cart-remove data-key="' +
              escapeHtml(item.key) +
              '" aria-label="' +
              escapeHtml(removeLabel) +
              '">Remove</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCart(cart) {
    if (!cartDrawer) return;

    updateCartCount(cart.item_count || 0);

    if (cartDrawerTotal) {
      cartDrawerTotal.textContent = formatMoney(cart.total_price, cartCurrencyCode);
    }

    if (cartDrawerCheckout) {
      cartDrawerCheckout.disabled = !cart.item_count;
    }

    if (!cart.item_count) {
      if (cartDrawerItems) {
        cartDrawerItems.innerHTML = '';
      }
      if (cartDrawerEmpty) {
        cartDrawerEmpty.hidden = false;
      }
      return;
    }

    if (cartDrawerEmpty) {
      cartDrawerEmpty.hidden = true;
    }

    if (cartDrawerItems) {
      cartDrawerItems.innerHTML = cart.items.map(renderCartItem).join('');
    }
  }

  function refreshCartDrawer() {
    if (!cartDrawer || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }

    setCartLoading(true);
    setCartStatus('');

    return requestJson(
      CART_JS_URL,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      },
      'Unable to load cart right now.'
    )
      .then(function (cart) {
        renderCart(cart);
        return cart;
      })
      .catch(function (error) {
        setCartStatus(error.message || 'Unable to load cart right now.');
        return null;
      })
      .finally(function () {
        setCartLoading(false);
      });
  }

  function openCartDrawer(trigger) {
    if (!cartDrawer) return;

    activeCartTrigger = trigger || activeCartTrigger;
    closeAllMobileMenus();

    if (!cartDrawer.hidden && cartDrawer.classList.contains('is-open')) {
      updateCartToggleState(true);
      return;
    }

    cartDrawer.hidden = false;
    cartDrawer.setAttribute('aria-hidden', 'false');
    body.classList.add('is-locked');
    updateCartToggleState(true);

    requestAnimationFrame(function () {
      cartDrawer.classList.add('is-open');
    });

    var closeButton = cartDrawer.querySelector('[data-cart-close]');
    if (closeButton) {
      closeButton.focus();
    }
  }

  function closeCartDrawer() {
    if (!cartDrawer || cartDrawer.hidden) return;

    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    body.classList.remove('is-locked');
    updateCartToggleState(false);

    setTimeout(function () {
      if (!cartDrawer.classList.contains('is-open')) {
        cartDrawer.hidden = true;
      }
    }, DRAWER_TRANSITION_MS);

    if (activeCartTrigger && typeof activeCartTrigger.focus === 'function') {
      activeCartTrigger.focus();
    }
  }

  function changeCartLineQuantity(key, quantity) {
    if (!key || cartIsBusy || typeof fetch !== 'function') {
      return;
    }

    setCartBusy(true);
    setCartLoading(true);
    setCartStatus('');

    requestJson(
      CART_CHANGE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          id: key,
          quantity: Math.max(Number(quantity) || 0, 0)
        })
      },
      'Unable to update cart right now.'
    )
      .then(function (cart) {
        renderCart(cart);
      })
      .catch(function (error) {
        setCartStatus(error.message || 'Unable to update cart right now.');
      })
      .finally(function () {
        setCartBusy(false);
        setCartLoading(false);
      });
  }

  function showFormError(target, message) {
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
  }

  function clearFormError(target) {
    if (!target) return;
    target.textContent = '';
    target.hidden = true;
  }

  /* ============================================================
     1. No-JS activation
  ============================================================ */

  doc.querySelectorAll('.js-pricing-grid').forEach(function (grid) {
    grid.classList.remove('no-js-hidden');
  });

  doc.querySelectorAll('.no-js-select-wrap').forEach(function (selectWrap) {
    selectWrap.setAttribute('aria-hidden', 'true');
    selectWrap.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  });

  /* ============================================================
     2. Variant card selection
  ============================================================ */

  doc.querySelectorAll('form[data-product-id]').forEach(function (productForm) {
    var cards = productForm.querySelectorAll('.js-variant-card');
    var variantSelect = productForm.querySelector('select[name="id"]');
    var addToCartButton = productForm.querySelector('[data-add-to-cart-button]');

    if (!cards.length || !variantSelect) {
      return;
    }

    function activateCard(card) {
      var variantId = card.getAttribute('data-variant-id');
      var isAvailable = card.getAttribute('data-available') !== 'false';

      cards.forEach(function (currentCard) {
        currentCard.classList.remove('is-selected');
        currentCard.setAttribute('aria-checked', 'false');
        currentCard.setAttribute('tabindex', '-1');
      });

      card.classList.add('is-selected');
      card.setAttribute('aria-checked', 'true');
      card.setAttribute('tabindex', '0');
      variantSelect.value = variantId;

      if (addToCartButton) {
        if (isAvailable) {
          addToCartButton.disabled = false;
          addToCartButton.textContent = 'ADD TO CART';
          addToCartButton.setAttribute('aria-label', 'Add selected size to cart');
        } else {
          addToCartButton.disabled = true;
          addToCartButton.textContent = 'SOLD OUT';
          addToCartButton.setAttribute('aria-label', 'This size is sold out');
        }
      }
    }

    function focusAdjacentCard(currentCard, direction) {
      var cardArray = Array.prototype.slice.call(cards);
      var currentIndex = cardArray.indexOf(currentCard);
      var nextIndex = currentIndex + direction;

      if (nextIndex >= 0 && nextIndex < cardArray.length) {
        cardArray[nextIndex].focus();
      }
    }

    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        activateCard(card);
      });

      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activateCard(card);
        }

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          focusAdjacentCard(card, 1);
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          focusAdjacentCard(card, -1);
        }
      });
    });
  });

  /* ============================================================
     3. Product form add-to-cart
  ============================================================ */

  doc.querySelectorAll('form[data-product-id]').forEach(function (productForm) {
    var variantSelect = productForm.querySelector('select[name="id"]');
    var submitButton = productForm.querySelector('[data-add-to-cart-button]');
    var errorTarget = productForm.querySelector('[data-cart-error]');

    if (!variantSelect || !submitButton) {
      return;
    }

    productForm.addEventListener('submit', function (event) {
      var variantId;
      var originalLabel;

      if (typeof fetch !== 'function') {
        return;
      }

      event.preventDefault();

      variantId = variantSelect.value;
      if (!variantId || isNaN(parseInt(variantId, 10))) {
        showFormError(errorTarget, 'Please select a size to continue.');
        return;
      }

      originalLabel = submitButton.textContent.trim() || 'ADD TO CART';

      clearFormError(errorTarget);
      submitButton.disabled = true;
      submitButton.textContent = 'ADDING...';
      submitButton.setAttribute('aria-label', 'Adding to cart, please wait');

      requestJson(
        CART_ADD_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            id: parseInt(variantId, 10),
            quantity: 1
          })
        },
        'Unable to add to cart.'
      )
        .then(function () {
          updateCartCount(getCurrentCartCount() + 1);
          submitButton.disabled = false;
          submitButton.textContent = originalLabel;
          submitButton.setAttribute('aria-label', 'Add selected size to cart');

          openCartDrawer(submitButton);
          return refreshCartDrawer();
        })
        .catch(function (error) {
          if (error.message === 'timeout' || error.name === 'TypeError') {
            submitButton.disabled = false;
            submitButton.textContent = originalLabel;
            productForm.submit();
            return;
          }

          submitButton.disabled = false;
          submitButton.textContent = originalLabel;
          submitButton.setAttribute('aria-label', 'Add selected size to cart');
          showFormError(errorTarget, error.message || 'Something went wrong. Please try again.');
        });
    });
  });

  /* ============================================================
     4. Cart drawer interactions
  ============================================================ */

  if (cartDrawer) {
    cartToggles.forEach(function (toggle) {
      toggle.addEventListener('click', function (event) {
        if (typeof fetch !== 'function') {
          return;
        }

        event.preventDefault();
        openCartDrawer(toggle);
        refreshCartDrawer();
      });
    });

    if (cartDrawerOverlay) {
      cartDrawerOverlay.addEventListener('click', closeCartDrawer);
    }

    cartDrawerCloseControls.forEach(function (control) {
      control.addEventListener('click', function () {
        closeCartDrawer();
      });
    });

    cartDrawer.addEventListener('click', function (event) {
      var quantityButton = event.target.closest('[data-cart-quantity-change]');
      var removeButton = event.target.closest('[data-cart-remove]');

      if (quantityButton) {
        changeCartLineQuantity(
          quantityButton.getAttribute('data-key'),
          quantityButton.getAttribute('data-quantity')
        );
        return;
      }

      if (removeButton) {
        changeCartLineQuantity(removeButton.getAttribute('data-key'), 0);
      }
    });

    if (typeof fetch === 'function') {
      refreshCartDrawer();
    }
  }

  /* ============================================================
     5. Sticky mobile buy bar
  ============================================================ */

  var stickyBar = doc.getElementById('stickyBuyBar');
  var heroSection = doc.getElementById('hero');

  if (stickyBar && heroSection && 'IntersectionObserver' in window) {
    var heroObserver = new IntersectionObserver(
      function (entries) {
        var entry = entries[0];

        if (!entry.isIntersecting) {
          stickyBar.classList.add('is-visible');
          stickyBar.setAttribute('aria-hidden', 'false');
        } else {
          stickyBar.classList.remove('is-visible');
          stickyBar.setAttribute('aria-hidden', 'true');
        }
      },
      { threshold: 0 }
    );

    heroObserver.observe(heroSection);
  }

  /* ============================================================
     6. Mobile navigation
  ============================================================ */

  function openMobileMenu(toggle, menu) {
    closeCartDrawer();
    closeAllMobileMenus();
    menu.classList.add('is-open');
    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
  }

  function closeMobileMenu(toggle, menu) {
    menu.classList.remove('is-open');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
  }

  function closeAllMobileMenus() {
    mobileMenus.forEach(function (pair) {
      closeMobileMenu(pair.toggle, pair.menu);
    });
  }

  doc.querySelectorAll('[data-mobile-menu-toggle]').forEach(function (toggle) {
    var menuId = toggle.getAttribute('aria-controls');
    var menu = menuId ? doc.getElementById(menuId) : null;

    if (!menu) {
      return;
    }

    mobileMenus.push({ toggle: toggle, menu: menu });

    toggle.addEventListener('click', function () {
      if (menu.classList.contains('is-open')) {
        closeMobileMenu(toggle, menu);
      } else {
        openMobileMenu(toggle, menu);
      }
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMobileMenu(toggle, menu);
      });
    });
  });

  /* ============================================================
     7. FAQ accordion
  ============================================================ */

  doc.querySelectorAll('.faq-item').forEach(function (item) {
    var questionButton = item.querySelector('.faq-question');
    var answerPanel = item.querySelector('.faq-answer');

    if (!questionButton || !answerPanel) {
      return;
    }

    questionButton.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');

      doc.querySelectorAll('.faq-item').forEach(function (currentItem) {
        var currentButton = currentItem.querySelector('.faq-question');
        var currentPanel = currentItem.querySelector('.faq-answer');

        currentItem.classList.remove('is-open');
        if (currentButton) currentButton.setAttribute('aria-expanded', 'false');
        if (currentPanel) currentPanel.hidden = true;
      });

      if (!isOpen) {
        item.classList.add('is-open');
        questionButton.setAttribute('aria-expanded', 'true');
        answerPanel.hidden = false;
      }
    });
  });

  /* ============================================================
     8. Smooth scroll
  ============================================================ */

  var siteHeader = doc.querySelector('[data-site-header]');

  doc.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
      var rawHref = anchor.getAttribute('href');
      var targetId = rawHref ? rawHref.replace('#', '') : '';
      var target = targetId ? doc.getElementById(targetId) : null;
      var headerOffset;
      var targetTop;

      if (!target) {
        return;
      }

      event.preventDefault();
      closeAllMobileMenus();

      headerOffset = siteHeader ? siteHeader.getBoundingClientRect().height : 0;
      targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerOffset - 8;

      try {
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      } catch (error) {
        window.scrollTo(0, targetTop);
      }

      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }

      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    });
  });

  /* ============================================================
     9. Global escape handling
  ============================================================ */

  doc.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }

    if (cartDrawer && !cartDrawer.hidden) {
      closeCartDrawer();
    }

    closeAllMobileMenus();
  });


  /* ============================================================
   10. Shopify Customizer live-preview re-init
============================================================ */

document.addEventListener('shopify:section:load', function () {
  // Re-reveal pricing grid after Customizer re-renders the section
  doc.querySelectorAll('.js-pricing-grid').forEach(function (grid) {
    grid.classList.remove('no-js-hidden');
  });

  // Re-hide the fallback select
  doc.querySelectorAll('.no-js-select-wrap').forEach(function (selectWrap) {
    selectWrap.setAttribute('aria-hidden', 'true');
    selectWrap.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  });
});
})();
