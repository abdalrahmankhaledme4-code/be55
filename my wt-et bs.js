"use strict";

let cart = [];

const CART_STORAGE_KEY = "homestyleFurnitureCart";
const USERS_STORAGE_KEY = "homestyleFurnitureUsers";
const CURRENT_USER_KEY = "homestyleFurnitureCurrentUser";
const RATINGS_STORAGE_KEY = "homestyleFurnitureRatings";

const DEFAULT_AVATAR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
        '<circle cx="20" cy="20" r="20" fill="#1b7b3a"/>' +
        '<circle cx="20" cy="16" r="7" fill="white"/>' +
        '<path d="M6 36c1.5-9 8-13 14-13s12.5 4 14 13" fill="white"/>' +
        '</svg>'
    );

let users = {};
let currentUser = null;
let selectedRatingStars = 0;
let signupPicDataUrl = "";
let captchaAnswer = null;

function loadCart() {
    try {
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);

        if (!savedCart) {
            cart = [];
            return;
        }

        const parsedCart = JSON.parse(savedCart);

        if (!Array.isArray(parsedCart)) {
            cart = [];
            return;
        }

        cart = parsedCart
            .filter(
                item =>
                    item &&
                    typeof item.name === "string" &&
                    Number.isFinite(Number(item.price))
            )
            .map(item => {
                const quantity = Number.isInteger(item.quantity) && item.quantity > 0
                    ? item.quantity
                    : 1;

                return {
                    name: item.name,
                    price: item.price,
                    quantity
                };
            });

    } catch (error) {
        console.warn("Could not load cart:", error);
        cart = [];
    }
}

function saveCart() {
    try {
        localStorage.setItem(
            CART_STORAGE_KEY,
            JSON.stringify(cart)
        );
    } catch (error) {
        console.warn("Could not save cart:", error);
    }
}

/* ================= AUTH: STORAGE ================= */

function loadUsers() {
    try {
        const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        users = savedUsers ? JSON.parse(savedUsers) : {};

        if (!users || typeof users !== "object") {
            users = {};
        }

    } catch (error) {
        console.warn("Could not load users:", error);
        users = {};
    }
}

function saveUsers() {
    try {
        localStorage.setItem(
            USERS_STORAGE_KEY,
            JSON.stringify(users)
        );
        return true;
    } catch (error) {
        console.warn("Could not save users:", error);
        return false;
    }
}

function loadCurrentUser() {
    try {
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        currentUser = savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
        console.warn("Could not load current user:", error);
        currentUser = null;
    }
}

function saveCurrentUser() {
    try {
        if (currentUser) {
            localStorage.setItem(
                CURRENT_USER_KEY,
                JSON.stringify(currentUser)
            );
        } else {
            localStorage.removeItem(CURRENT_USER_KEY);
        }
        return true;
    } catch (error) {
        console.warn("Could not save current user:", error);
        return false;
    }
}

/* ================= AUTH: MODAL HELPERS ================= */

let lastFocusedElement = null;

function getFocusableElements(container) {
    return Array.from(
        container.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter(el => el.offsetParent !== null);
}

function trapFocus(event, modal) {
    if (event.key !== "Tab") {
        return;
    }

    const focusable = getFocusableElements(modal);

    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    lastFocusedElement = document.activeElement;

    modal.hidden = false;

    const modalBox = modal.querySelector(".modalBox");
    const focusable = modalBox ? getFocusableElements(modalBox) : [];

    if (focusable.length > 0) {
        focusable[0].focus();
    } else if (modalBox) {
        modalBox.focus();
    }

    modal._trapHandler = function (event) {
        trapFocus(event, modalBox || modal);
    };

    modal.addEventListener("keydown", modal._trapHandler);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
        return;
    }

    modal.hidden = true;

    if (modal._trapHandler) {
        modal.removeEventListener("keydown", modal._trapHandler);
        modal._trapHandler = null;
    }

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
    }

    lastFocusedElement = null;
}

/* ================= AUTH: CAPTCHA ================= */

function generateCaptcha() {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);

    captchaAnswer = a + b;

    const captchaQuestion = document.getElementById("captchaQuestion");
    const captchaInput = document.getElementById("signupCaptcha");

    if (captchaQuestion) {
        captchaQuestion.textContent = `What is ${a} + ${b}?`;
    }

    if (captchaInput) {
        captchaInput.value = "";
        captchaInput.removeAttribute("aria-invalid");
    }
}

/* ================= AUTH: SIGN UP / LOGIN / LOGOUT ================= */

async function hashPassword(plainPassword) {
    const encoded = new TextEncoder().encode(plainPassword);
    const digest = await crypto.subtle.digest("SHA-256", encoded);

    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function signUp(username, email, password, picDataUrl) {
    const cleanUsername = String(username || "")
        .trim()
        .replace(/[^\w \-]/g, "");

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (!cleanUsername || !cleanEmail || !cleanPassword) {
        return "Please fill in username, email and password.";
    }

    if (!cleanEmail.includes("@")) {
        return "Please enter a valid email address.";
    }

    if (cleanPassword.length < 8) {
        return "Password must be at least 8 characters.";
    }

    if (!/\d/.test(cleanPassword)) {
        return "Password must include at least one number.";
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]/\\;']/.test(cleanPassword)) {
        return "Password must include at least one special character (e.g. ! @ # $ %).";
    }

    if (users[cleanEmail]) {
        return "An account with this email already exists.";
    }

    users[cleanEmail] = {
        username: cleanUsername,
        email: cleanEmail,
        passwordHash: await hashPassword(cleanPassword),
        pic: picDataUrl || ""
    };

    if (!saveUsers()) {
        delete users[cleanEmail];
        return "Couldn't save your account — your browser storage may be full. Try removing the profile picture and signing up again.";
    }

    currentUser = {
        username: cleanUsername,
        email: cleanEmail,
        pic: picDataUrl || ""
    };

    saveCurrentUser();

    return "";
}

async function logIn(email, password) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    const account = users[cleanEmail];
    const attemptedHash = await hashPassword(cleanPassword);

    if (!account || account.passwordHash !== attemptedHash) {
        return "Incorrect email or password.";
    }

    currentUser = {
        username: account.username,
        email: account.email,
        pic: account.pic || ""
    };

    saveCurrentUser();

    return "";
}

function logOut() {
    currentUser = null;
    saveCurrentUser();
    renderAuthUI();
}

function maskEmail(email) {
    const cleanEmail = String(email || "");

    if (cleanEmail.length <= 3) {
        return cleanEmail;
    }

    const visiblePart = cleanEmail.slice(0, 3);
    const hiddenPart = "*".repeat(cleanEmail.length - 3);

    return visiblePart + hiddenPart;
}

function openProfileModal() {
    if (!currentUser) {
        openModal("loginModal");
        return;
    }

    const profilePic = document.getElementById("profilePic");
    const profileUsername = document.getElementById("profileUsername");
    const profileEmail = document.getElementById("profileEmail");
    const profilePassword = document.getElementById("profilePassword");

    if (profilePic) {
        profilePic.src = currentUser.pic || DEFAULT_AVATAR;
    }

    if (profileUsername) {
        profileUsername.textContent = currentUser.username;
    }

    if (profileEmail) {
        profileEmail.textContent = maskEmail(currentUser.email);
    }

    if (profilePassword) {
        profilePassword.textContent = "••••••••";
    }

    openModal("profileModal");
}

function setupProfileLink() {
    const profileMenuLink = document.getElementById("profileMenuLink");

    if (!profileMenuLink) {
        return;
    }

    profileMenuLink.addEventListener("click", function (event) {
        event.preventDefault();
        openProfileModal();
    });
}

function renderAuthUI() {
    const authArea = document.getElementById("authArea");
    const userArea = document.getElementById("userArea");
    const userAvatar = document.getElementById("userAvatar");

    if (!authArea || !userArea) {
        return;
    }

    if (currentUser) {
        authArea.hidden = true;
        userArea.hidden = false;

        if (userAvatar) {
            userAvatar.src = currentUser.pic || DEFAULT_AVATAR;
            userAvatar.alt = `${currentUser.username}'s profile picture`;
        }

    } else {
        authArea.hidden = false;
        userArea.hidden = true;
    }
}

/* ================= RATING ================= */

function loadRatings() {
    try {
        const savedRatings = localStorage.getItem(RATINGS_STORAGE_KEY);
        const parsed = savedRatings ? JSON.parse(savedRatings) : [];

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.warn("Could not load ratings:", error);
        return [];
    }
}

function saveRating(stars) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return;
    }

    const ratings = loadRatings();

    ratings.push({
        stars: stars,
        user: currentUser ? currentUser.username : "Guest",
        date: new Date().toISOString()
    });

    try {
        localStorage.setItem(
            RATINGS_STORAGE_KEY,
            JSON.stringify(ratings)
        );
    } catch (error) {
        console.warn("Could not save rating:", error);
    }
}

function resetRatingModal() {
    selectedRatingStars = 0;

    const submitRatingBtn = document.getElementById("submitRatingBtn");

    if (submitRatingBtn) {
        submitRatingBtn.disabled = true;
    }

    document
        .querySelectorAll("#starRating .starBtn")
        .forEach((starBtn, index) => {
            starBtn.classList.remove("filled");
            starBtn.setAttribute("aria-checked", "false");
            starBtn.setAttribute("tabindex", index === 0 ? "0" : "-1");
        });
}

function addToCart(name, price) {
    const cleanName = String(name || "").trim();
    const cleanPrice = Number(price);

    if (
        !cleanName ||
        !Number.isFinite(cleanPrice) ||
        cleanPrice < 0
    ) {
        return;
    }

    const existingItem = cart.find(
        item => item.name === cleanName && item.price === cleanPrice
    );

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            name: cleanName,
            price: cleanPrice,
            quantity: 1
        });
    }

    saveCart();
    updateCart();
}

function changeQuantity(index, delta) {
    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= cart.length
    ) {
        return;
    }

    const item = cart[index];
    const newQuantity = item.quantity + delta;

    if (newQuantity < 1) {
        return;
    }

    item.quantity = newQuantity;

    saveCart();
    updateCart();
}

function removeFromCart(index) {
    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= cart.length
    ) {
        return;
    }

    cart.splice(index, 1);

    saveCart();
    updateCart();
}

function updateCart() {
    const cartCount =
        document.getElementById("cartCount");

    const topCartCount =
        document.getElementById("topCartCount");

    const cartItems =
        document.getElementById("cartItems");

    const cartTotal =
        document.getElementById("cartTotal");

    const emptyCartMessage =
        document.getElementById("emptyCartMessage");

    if (!cartItems || !cartTotal) {
        return;
    }

    let itemCount = 0;
    let total = 0;

    cartItems.innerHTML = "";

    cart.forEach((item, index) => {
        const price = Number(item.price);
        const quantity = Number.isInteger(item.quantity) && item.quantity > 0
            ? item.quantity
            : 1;

        const subtotal = price * quantity;

        itemCount += quantity;
        total += subtotal;

        const div =
            document.createElement("div");

        div.className = "cartItem";

        const name =
            document.createElement("span");

        name.className = "cartItemName";

        name.textContent =
            `${item.name} - £${price.toFixed(2)} each (£${subtotal.toFixed(2)})`;

        const quantityControls =
            document.createElement("div");

        quantityControls.className = "quantityControls";

        const decreaseButton =
            document.createElement("button");

        decreaseButton.type = "button";
        decreaseButton.className = "quantityBtn";
        decreaseButton.textContent = "−";
        decreaseButton.setAttribute("aria-label", `Decrease quantity of ${item.name}`);

        decreaseButton.addEventListener("click", () => {
            if (quantity === 1) {
                if (window.confirm(`Remove "${item.name}" from your cart?`)) {
                    removeFromCart(index);
                }
                return;
            }

            changeQuantity(index, -1);
        });

        const quantityLabel =
            document.createElement("span");

        quantityLabel.className = "quantityLabel";
        quantityLabel.textContent = `${quantity}x`;
        quantityLabel.setAttribute("aria-live", "polite");

        const increaseButton =
            document.createElement("button");

        increaseButton.type = "button";
        increaseButton.className = "quantityBtn";
        increaseButton.textContent = "+";
        increaseButton.setAttribute("aria-label", `Increase quantity of ${item.name}`);

        increaseButton.addEventListener("click", () => {
            changeQuantity(index, 1);
        });

        quantityControls.appendChild(decreaseButton);
        quantityControls.appendChild(quantityLabel);
        quantityControls.appendChild(increaseButton);

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.className = "removeBtn";

        removeButton.addEventListener(
            "click",
            () => {
                if (window.confirm(`Remove "${item.name}" from your cart?`)) {
                    removeFromCart(index);
                }
            }
        );

        div.appendChild(name);
        div.appendChild(quantityControls);
        div.appendChild(removeButton);

        cartItems.appendChild(div);
    });

    if (cartCount) {
        cartCount.textContent = itemCount;
    }

    if (topCartCount) {
        topCartCount.textContent = itemCount;
    }

    cartTotal.textContent =
        `Total: £${total.toFixed(2)}`;

    if (emptyCartMessage) {
        emptyCartMessage.hidden =
            itemCount !== 0;
    }
}

function buyCart() {
    if (!currentUser) {
        alert("Please log in or create an account to complete your purchase.");
        openModal("loginModal");
        return;
    }

    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    if (!window.confirm("Confirm your purchase?")) {
        return;
    }

    alert("Thank you for your purchase! 🛍️");

    cart = [];

    saveCart();
    updateCart();

    resetRatingModal();
    openModal("ratingModal");
}

function setupSearch() {
    const searchBox =
        document.getElementById("searchBox");

    const searchMessage =
        document.getElementById("searchMessage");

    if (!searchBox) {
        return;
    }

    searchBox.addEventListener(
        "input",
        function () {
            const value =
                this.value
                    .trim()
                    .toLowerCase();

            const cards =
                document.querySelectorAll(".card");

            let visibleProducts = 0;

            cards.forEach(card => {
                const titleElement =
                    card.querySelector("h2");

                if (!titleElement) {
                    return;
                }

                const title =
                    titleElement.textContent
                        .trim()
                        .toLowerCase();

                const matches =
                    title.includes(value);

                card.classList.toggle(
                    "hidden",
                    !matches
                );

                if (matches) {
                    visibleProducts++;
                }
            });

            if (!searchMessage) {
                return;
            }

            if (value === "") {
                searchMessage.textContent = "";
            } else if (visibleProducts === 0) {
                searchMessage.textContent =
                    "No furniture found. Try another search.";
            } else {
                searchMessage.textContent =
                    `${visibleProducts} product${visibleProducts === 1 ? "" : "s"} found.`;
            }
        }
    );
}

function setupMenu() {
    const menuBtn =
        document.getElementById("menuBtn");

    const menu =
        document.getElementById("mobileMenu");

    if (!menuBtn || !menu) {
        return;
    }

    function openMenu() {
        menu.classList.add("open");

        menuBtn.setAttribute("aria-expanded", "true");
        menuBtn.setAttribute("aria-label", "Close menu");
        menu.setAttribute("aria-hidden", "false");

        const firstLink = menu.querySelector("a");

        if (firstLink) {
            firstLink.focus();
        }

        document.addEventListener("keydown", trapMenuTab);
    }

    function closeMenu(returnFocus) {
        menu.classList.remove("open");

        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.setAttribute("aria-label", "Open menu");
        menu.setAttribute("aria-hidden", "true");

        document.removeEventListener("keydown", trapMenuTab);

        if (returnFocus) {
            menuBtn.focus();
        }
    }

    function trapMenuTab(event) {
        if (event.key === "Escape") {
            closeMenu(true);
            return;
        }

        if (event.key !== "Tab") {
            return;
        }

        const focusable = Array.from(menu.querySelectorAll("a"));

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    menuBtn.addEventListener(
        "click",
        function (event) {
            event.stopPropagation();

            if (menu.classList.contains("open")) {
                closeMenu(false);
            } else {
                openMenu();
            }
        }
    );

    document.addEventListener(
        "click",
        function (event) {
            if (
                menu.classList.contains("open") &&
                !menu.contains(event.target) &&
                event.target !== menuBtn
            ) {
                closeMenu(false);
            }
        }
    );

    menu.querySelectorAll("a").forEach(
        function (link) {
            link.addEventListener(
                "click",
                function () {
                    closeMenu(false);
                }
            );
        }
    );
}

function setupCartButton() {
    const topCartBtn =
        document.getElementById("cartBtn");

    if (!topCartBtn) {
        return;
    }

    topCartBtn.addEventListener(
        "click",
        function () {
            const cartSection =
                document.getElementById("cart");

            if (!cartSection) {
                return;
            }

            cartSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    );
}

function setupProductButtons() {
    document
        .querySelectorAll(".cartBtn")
        .forEach(button => {
            button.addEventListener(
                "click",
                function () {
                    const name =
                        button.dataset.name;

                    const price =
                        Number(button.dataset.price);

                    addToCart(name, price);

                    button.textContent =
                        "✓ Added!";

                    setTimeout(
                        function () {
                            button.textContent =
                                "Add to Cart";
                        },
                        800
                    );
                }
            );
        });
}

function setupModalCloseButtons() {
    document
        .querySelectorAll("[data-close-modal]")
        .forEach(button => {
            button.addEventListener("click", function () {
                closeModal(button.dataset.closeModal);
            });
        });

    document
        .querySelectorAll(".modalOverlay")
        .forEach(overlay => {
            overlay.addEventListener("click", function (event) {
                if (event.target === overlay) {
                    closeModal(overlay.id);
                }
            });
        });

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") {
            return;
        }

        document
            .querySelectorAll(".modalOverlay")
            .forEach(overlay => {
                if (!overlay.hidden) {
                    closeModal(overlay.id);
                }
            });
    });
}

function setupAuth() {
    const loginBtn = document.getElementById("loginBtn");
    const signupBtn = document.getElementById("signupBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    const loginError = document.getElementById("loginError");
    const signupError = document.getElementById("signupError");

    const switchToSignup = document.getElementById("switchToSignup");
    const switchToLogin = document.getElementById("switchToLogin");

    const signupPic = document.getElementById("signupPic");
    const signupPicPreview = document.getElementById("signupPicPreview");

    if (loginBtn) {
        loginBtn.addEventListener("click", function () {
            openModal("loginModal");
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener("click", function () {
            generateCaptcha();
            openModal("signupModal");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            if (window.confirm("Are you sure you want to log out?")) {
                logOut();
            }
        });
    }

    if (switchToSignup) {
        switchToSignup.addEventListener("click", function () {
            closeModal("loginModal");
            generateCaptcha();
            openModal("signupModal");
        });
    }

    if (switchToLogin) {
        switchToLogin.addEventListener("click", function () {
            closeModal("signupModal");
            openModal("loginModal");
        });
    }

    if (signupPic) {
        signupPic.addEventListener("change", function () {
            const file = signupPic.files && signupPic.files[0];

            if (!file) {
                signupPicDataUrl = "";

                if (signupPicPreview) {
                    signupPicPreview.hidden = true;
                }

                return;
            }

            const reader = new FileReader();

            reader.onload = function () {
                signupPicDataUrl = String(reader.result || "");

                if (signupPicPreview) {
                    signupPicPreview.src = signupPicDataUrl;
                    signupPicPreview.hidden = false;
                }
            };

            reader.readAsDataURL(file);
        });
    }

    if (loginForm) {
        let failedLoginAttempts = 0;
        let loginLockedUntil = 0;
        const loginSubmitBtn = loginForm.querySelector(".authSubmitBtn");

        function remainingLockSeconds() {
            return Math.max(0, Math.ceil((loginLockedUntil - Date.now()) / 1000));
        }

        function updateLoginLockUI() {
            const remaining = remainingLockSeconds();

            if (remaining <= 0) {
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.textContent = "Login";
                }
                return;
            }

            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = true;
                loginSubmitBtn.textContent = "Try again in " + remaining + "s";
            }

            if (loginError) {
                loginError.textContent =
                    "Too many failed attempts. Please wait " + remaining + " seconds.";
            }

            setTimeout(updateLoginLockUI, 1000);
        }

        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (remainingLockSeconds() > 0) {
                updateLoginLockUI();
                return;
            }

            const loginEmailInput = document.getElementById("loginEmail");
            const loginPasswordInput = document.getElementById("loginPassword");

            const email = loginEmailInput.value;
            const password = loginPasswordInput.value;

            const error = await logIn(email, password);

            if (error) {
                failedLoginAttempts += 1;

                if (loginError) {
                    loginError.textContent = error;
                    loginError.setAttribute("tabindex", "-1");
                    loginError.focus();
                }

                loginEmailInput.setAttribute("aria-invalid", "true");
                loginPasswordInput.setAttribute("aria-invalid", "true");

                if (failedLoginAttempts >= 5) {
                    loginLockedUntil = Date.now() + 30000;
                    failedLoginAttempts = 0;
                    updateLoginLockUI();
                }

                return;
            }

            failedLoginAttempts = 0;

            if (loginError) {
                loginError.textContent = "";
            }

            loginEmailInput.removeAttribute("aria-invalid");
            loginPasswordInput.removeAttribute("aria-invalid");

            loginForm.reset();
            closeModal("loginModal");
            renderAuthUI();
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const signupUsernameInput = document.getElementById("signupUsername");
            const signupEmailInput = document.getElementById("signupEmail");
            const signupPasswordInput = document.getElementById("signupPassword");

            const username = signupUsernameInput.value;
            const email = signupEmailInput.value;
            const password = signupPasswordInput.value;

            const signupCaptchaInput = document.getElementById("signupCaptcha");
            const captchaEntry = signupCaptchaInput ? signupCaptchaInput.value.trim() : "";

            if (Number(captchaEntry) !== captchaAnswer || captchaEntry === "") {
                if (signupError) {
                    signupError.textContent = "Security check failed — please answer the question correctly.";
                    signupError.setAttribute("tabindex", "-1");
                    signupError.focus();
                }

                if (signupCaptchaInput) {
                    signupCaptchaInput.setAttribute("aria-invalid", "true");
                }

                generateCaptcha();
                return;
            }

            const error = await signUp(username, email, password, signupPicDataUrl);

            if (error) {
                if (signupError) {
                    signupError.textContent = error;
                    signupError.setAttribute("tabindex", "-1");
                    signupError.focus();
                }

                signupUsernameInput.setAttribute("aria-invalid", "true");
                signupEmailInput.setAttribute("aria-invalid", "true");
                signupPasswordInput.setAttribute("aria-invalid", "true");

                generateCaptcha();

                return;
            }

            if (signupError) {
                signupError.textContent = "";
            }

            signupUsernameInput.removeAttribute("aria-invalid");
            signupEmailInput.removeAttribute("aria-invalid");
            signupPasswordInput.removeAttribute("aria-invalid");

            signupForm.reset();
            signupPicDataUrl = "";

            if (signupPicPreview) {
                signupPicPreview.hidden = true;
            }

            closeModal("signupModal");
            renderAuthUI();
        });
    }

    document
        .querySelectorAll(".togglePasswordBtn")
        .forEach(toggleBtn => {
            toggleBtn.addEventListener("click", function () {
                const targetInput = document.getElementById(
                    toggleBtn.dataset.toggleFor
                );

                if (!targetInput) {
                    return;
                }

                const isPassword = targetInput.type === "password";

                targetInput.type = isPassword ? "text" : "password";

                toggleBtn.setAttribute("aria-pressed", String(isPassword));
                toggleBtn.setAttribute(
                    "aria-label",
                    isPassword ? "Hide password" : "Show password"
                );
            });
        });
}

function setupRating() {
    const starButtons = Array.from(
        document.querySelectorAll("#starRating .starBtn")
    );

    const submitRatingBtn = document.getElementById("submitRatingBtn");
    const skipRatingBtn = document.getElementById("skipRatingBtn");

    function selectStar(stars) {
        selectedRatingStars = stars;

        starButtons.forEach(otherStar => {
            const isSelected = Number(otherStar.dataset.star) === stars;
            const isFilled = Number(otherStar.dataset.star) <= stars;

            otherStar.classList.toggle("filled", isFilled);
            otherStar.setAttribute("aria-checked", String(isSelected));
            otherStar.setAttribute("tabindex", isSelected ? "0" : "-1");
        });

        if (submitRatingBtn) {
            submitRatingBtn.disabled = stars < 1;
        }
    }

    starButtons.forEach((starBtn, index) => {
        starBtn.addEventListener("click", function () {
            selectStar(Number(starBtn.dataset.star));
            starBtn.focus();
        });

        starBtn.addEventListener("keydown", function (event) {
            let targetIndex = null;

            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                targetIndex = (index + 1) % starButtons.length;
            } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                targetIndex = (index - 1 + starButtons.length) % starButtons.length;
            }

            if (targetIndex === null) {
                return;
            }

            event.preventDefault();

            const targetStar = starButtons[targetIndex];

            selectStar(Number(targetStar.dataset.star));
            targetStar.focus();
        });
    });

    if (submitRatingBtn) {
        submitRatingBtn.addEventListener("click", function () {
            saveRating(selectedRatingStars);
            closeModal("ratingModal");
        });
    }

    if (skipRatingBtn) {
        skipRatingBtn.addEventListener("click", function () {
            closeModal("ratingModal");
        });
    }
}

function setupBuyButton() {
    const buyBtn =
        document.getElementById("buyBtn");

    if (!buyBtn) {
        return;
    }

    buyBtn.addEventListener(
        "click",
        buyCart
    );
}

function init() {
    loadCart();
    loadUsers();
    loadCurrentUser();

    setupProductButtons();
    setupSearch();
    setupMenu();
    setupCartButton();
    setupBuyButton();
    setupModalCloseButtons();
    setupAuth();
    setupRating();
    setupProfileLink();

    updateCart();
    renderAuthUI();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}