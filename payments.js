/* =========================================================
   U.S TRAVEL & TOURS
   PAYMENT JAVASCRIPT
   Bitcoin + PayPal
   Frontend → Backend Payment Submission
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    "use strict";

    /* =====================================================
       ELEMENTS
       ===================================================== */

    const paymentForm =
        document.getElementById("paymentForm");

    const paymentMethod =
        document.getElementById("paymentMethod");

    const paymentReference =
        document.getElementById("paymentReference");

    const paymentMessage =
        document.getElementById("paymentMessage");

    const paymentProof =
        document.getElementById("paymentProof");

    const paymentFileName =
        document.getElementById("paymentFileName");

    const paymentFormMessage =
        document.getElementById("paymentFormMessage");

    const paymentSubmitBtn =
        document.getElementById("paymentSubmitBtn");

    const methodButtons =
        document.querySelectorAll(".payment-method-btn");

    const paymentPanels =
        document.querySelectorAll(".payment-panel");

    const copyButtons =
        document.querySelectorAll(".copy-payment-btn");


    /* =====================================================
       CONFIGURATION
       ===================================================== */

    const ALLOWED_PAYMENT_METHODS = [
        "bitcoin",
        "paypal"
    ];

    const ALLOWED_FILE_TYPES = [
        "image/jpeg",
        "image/png",
        "application/pdf"
    ];

    const ALLOWED_FILE_EXTENSIONS = [
        ".jpg",
        ".jpeg",
        ".png",
        ".pdf"
    ];

    const MAX_FILE_SIZE =
        5 * 1024 * 1024;

    const PAYMENT_ENDPOINT =
        "https://u-s-travel-tours-1.onrender.com/api/application-payment";


    /* =====================================================
       MESSAGE FUNCTIONS
       ===================================================== */

    function showMessage(message, type) {

        if (!paymentFormMessage) {
            return;
        }

        paymentFormMessage.textContent =
            message || "";

        paymentFormMessage.classList.remove(
            "success",
            "error"
        );

        if (type) {
            paymentFormMessage.classList.add(type);
        }

        if (message) {

            paymentFormMessage.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });

        }

    }


    function clearMessage() {

        if (!paymentFormMessage) {
            return;
        }

        paymentFormMessage.textContent = "";

        paymentFormMessage.classList.remove(
            "success",
            "error"
        );

    }


    /* =====================================================
       PAYMENT METHOD SWITCHING
       ===================================================== */

    function showPaymentMethod(method) {

        if (!ALLOWED_PAYMENT_METHODS.includes(method)) {
            method = "bitcoin";
        }


        /* Update method buttons */

        methodButtons.forEach(function (button) {

            const buttonMethod =
                button.dataset.paymentMethod;

            button.classList.toggle(
                "active",
                buttonMethod === method
            );

            button.setAttribute(
                "aria-selected",
                buttonMethod === method
                    ? "true"
                    : "false"
            );

        });


        /* Update payment panels */

        paymentPanels.forEach(function (panel) {

            const panelMethod =
                panel.dataset.panel;

            panel.classList.toggle(
                "active",
                panelMethod === method
            );

        });


        /* Update hidden/select payment method */

        if (paymentMethod) {
            paymentMethod.value = method;
        }


        clearMessage();

    }


    /* =====================================================
       PAYMENT METHOD BUTTONS
       ===================================================== */

    methodButtons.forEach(function (button) {

        button.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                const method =
                    this.dataset.paymentMethod;

                if (!method) {
                    return;
                }

                if (
                    !ALLOWED_PAYMENT_METHODS.includes(
                        method
                    )
                ) {

                    showMessage(
                        "Please select Bitcoin or PayPal.",
                        "error"
                    );

                    return;
                }

                showPaymentMethod(method);

            }
        );

    });


    /* =====================================================
       PAYMENT METHOD SELECT
       ===================================================== */

    if (paymentMethod) {

        paymentMethod.addEventListener(
            "change",
            function () {

                const method =
                    this.value;

                if (
                    ALLOWED_PAYMENT_METHODS.includes(
                        method
                    )
                ) {

                    showPaymentMethod(method);

                } else {

                    showPaymentMethod("bitcoin");

                }

            }
        );

    }


    /* =====================================================
       COPY PAYMENT DETAILS
       ===================================================== */

    copyButtons.forEach(function (button) {

        button.addEventListener(
            "click",
            async function (event) {

                event.preventDefault();

                const targetId =
                    this.dataset.copyTarget;

                if (!targetId) {
                    return;
                }

                const target =
                    document.getElementById(targetId);

                if (!target) {
                    return;
                }


                let value = "";

                if (
                    "value" in target &&
                    target.value
                ) {

                    value =
                        target.value.trim();

                } else {

                    value =
                        target.textContent.trim();

                }


                if (!value) {

                    showMessage(
                        "Payment details are not available.",
                        "error"
                    );

                    return;
                }


                const originalHTML =
                    this.innerHTML;


                try {

                    if (
                        navigator.clipboard &&
                        window.isSecureContext
                    ) {

                        await navigator.clipboard.writeText(
                            value
                        );

                    } else {

                        const temporaryInput =
                            document.createElement("textarea");

                        temporaryInput.value =
                            value;

                        temporaryInput.style.position =
                            "fixed";

                        temporaryInput.style.opacity =
                            "0";

                        document.body.appendChild(
                            temporaryInput
                        );

                        temporaryInput.focus();
                        temporaryInput.select();

                        document.execCommand(
                            "copy"
                        );

                        temporaryInput.remove();

                    }


                    this.innerHTML =
                        '<i class="fa-solid fa-check"></i> Copied';

                    this.classList.add("copied");


                    setTimeout(
                        function () {

                            button.innerHTML =
                                originalHTML;

                            button.classList.remove(
                                "copied"
                            );

                        },
                        1800
                    );


                } catch (error) {

                    console.error(
                        "Copy payment details error:",
                        error
                    );

                    showMessage(
                        "Unable to copy automatically. Please copy the payment details manually.",
                        "error"
                    );

                }

            }
        );

    });


    /* =====================================================
       PAYMENT PROOF VALIDATION
    ===================================================== */

    function validatePaymentProof(file) {

        if (!file) {
            return true;
        }


        const fileName =
            file.name.toLowerCase();


        const extensionAllowed =
            ALLOWED_FILE_EXTENSIONS.some(
                function (extension) {
                    return fileName.endsWith(
                        extension
                    );
                }
            );


        const typeAllowed =
            ALLOWED_FILE_TYPES.includes(
                file.type
            );


        if (
            !extensionAllowed &&
            !typeAllowed
        ) {

            return false;

        }


        if (file.size > MAX_FILE_SIZE) {

            return false;

        }


        return true;

    }


    /* =====================================================
       PAYMENT PROOF FILE INPUT
       ===================================================== */

    if (paymentProof) {

        paymentProof.addEventListener(
            "change",
            function () {

                clearMessage();


                const file =
                    this.files &&
                    this.files[0];


                if (!file) {

                    if (paymentFileName) {
                        paymentFileName.textContent = "";
                    }

                    return;

                }


                const fileName =
                    file.name.toLowerCase();


                const extensionAllowed =
                    ALLOWED_FILE_EXTENSIONS.some(
                        function (extension) {

                            return fileName.endsWith(
                                extension
                            );

                        }
                    );


                const typeAllowed =
                    ALLOWED_FILE_TYPES.includes(
                        file.type
                    );


                if (
                    !extensionAllowed &&
                    !typeAllowed
                ) {

                    this.value = "";

                    if (paymentFileName) {
                        paymentFileName.textContent = "";
                    }

                    showMessage(
                        "Please upload a JPG, PNG or PDF payment proof.",
                        "error"
                    );

                    return;

                }


                if (
                    file.size > MAX_FILE_SIZE
                ) {

                    this.value = "";

                    if (paymentFileName) {
                        paymentFileName.textContent = "";
                    }

                    showMessage(
                        "Payment proof must be 5 MB or smaller.",
                        "error"
                    );

                    return;

                }


                if (paymentFileName) {

                    paymentFileName.textContent =
                        "✓ " + file.name;

                }


                clearMessage();

            }
        );

    }


    /* =====================================================
       VALIDATE PAYMENT FORM
       ===================================================== */

    function validatePaymentForm() {

        clearMessage();


        /* Payment method */

        if (!paymentMethod) {

            showMessage(
                "Payment method field is missing.",
                "error"
            );

            return false;

        }


        const selectedMethod =
            paymentMethod.value;


        if (
            !ALLOWED_PAYMENT_METHODS.includes(
                selectedMethod
            )
        ) {

            showMessage(
                "Please select Bitcoin or PayPal.",
                "error"
            );

            paymentMethod.focus();

            return false;

        }


        /* Payment reference */

        if (
            !paymentReference ||
            !paymentReference.value.trim()
        ) {

            showMessage(
                "Please enter your transaction or payment reference.",
                "error"
            );

            if (paymentReference) {
                paymentReference.focus();
            }

            return false;

        }


        const reference =
            paymentReference.value.trim();


        if (reference.length < 3) {

            showMessage(
                "Please enter a valid transaction or payment reference.",
                "error"
            );

            paymentReference.focus();

            return false;

        }


        if (reference.length > 150) {

            showMessage(
                "Payment reference must be 150 characters or fewer.",
                "error"
            );

            paymentReference.focus();

            return false;

        }


        /* Payment proof */

        if (
            paymentProof &&
            paymentProof.files &&
            paymentProof.files.length > 0
        ) {

            const file =
                paymentProof.files[0];


            const fileName =
                file.name.toLowerCase();


            const extensionAllowed =
                ALLOWED_FILE_EXTENSIONS.some(
                    function (extension) {
                        return fileName.endsWith(
                            extension
                        );
                    }
                );


            const typeAllowed =
                ALLOWED_FILE_TYPES.includes(
                    file.type
                );


            if (
                !extensionAllowed &&
                !typeAllowed
            ) {

                showMessage(
                    "Please upload a JPG, PNG or PDF payment proof.",
                    "error"
                );

                paymentProof.focus();

                return false;

            }


            if (
                file.size > MAX_FILE_SIZE
            ) {

                showMessage(
                    "Payment proof must be 5 MB or smaller.",
                    "error"
                );

                paymentProof.focus();

                return false;

            }

        }


        return true;

    }


    /* =====================================================
       GET PENDING APPLICATION
    ===================================================== */

    function getPendingApplication() {

        try {

            const savedApplication =
                sessionStorage.getItem(
                    "pendingApplication"
                );


            if (!savedApplication) {
                return null;
            }


            const application =
                JSON.parse(
                    savedApplication
                );


            if (
                !application ||
                typeof application !== "object"
            ) {

                return null;

            }


            return application;

        } catch (error) {

            console.error(
                "Unable to read pending application:",
                error
            );

            return null;

        }

    }


    /* =====================================================
       BUTTON LOADING STATE
    ===================================================== */

    function setButtonLoading(
        isLoading,
        originalHTML
    ) {

        if (!paymentSubmitBtn) {
            return;
        }


        if (isLoading) {

            paymentSubmitBtn.disabled =
                true;

            paymentSubmitBtn.setAttribute(
                "aria-busy",
                "true"
            );

            paymentSubmitBtn.innerHTML =
                '<span>Submitting Payment...</span>' +
                '<i class="fa-solid fa-spinner fa-spin"></i>';

        } else {

            paymentSubmitBtn.disabled =
                false;

            paymentSubmitBtn.removeAttribute(
                "aria-busy"
            );

            if (originalHTML) {

                paymentSubmitBtn.innerHTML =
                    originalHTML;

            }

        }

    }


    /* =====================================================
       FORM SUBMISSION
       ===================================================== */

    if (paymentForm) {

        paymentForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                /* Prevent accidental double submit */

                if (
                    paymentSubmitBtn &&
                    paymentSubmitBtn.disabled
                ) {

                    return;

                }


                /* Validate */

                if (!validatePaymentForm()) {
                    return;
                }


                /* Get application */

                const pendingApplication =
                    getPendingApplication();


                if (!pendingApplication) {

                    showMessage(
                        "Your application information could not be found. Please return to the application page and submit the application again.",
                        "error"
                    );

                    return;

                }


                /* =================================================
                   GET APPLICATION ID
                ================================================= */

                const applicationId =
                    Number(
                        pendingApplication.applicationId
                    );

                if (
                    !Number.isSafeInteger(applicationId) ||
                    applicationId <= 0
                ) {

                    showMessage(
                        "Valid Application ID is required. Please return to the application page and submit the application again.",
                        "error"
                    );

                    return;

                }


                const originalButtonHTML =
                    paymentSubmitBtn
                        ? paymentSubmitBtn.innerHTML
                        : "";


                setButtonLoading(
                    true,
                    originalButtonHTML
                );


                try {

                    /* =================================================
                       BUILD FORM DATA
                    ================================================= */

                    const formData =
                        new FormData();


                    /* Application ID */

                    formData.append(
                        "applicationId",
                        String(applicationId)
                    );


                    /* Keep application information */

                    formData.append(
                        "application",
                        JSON.stringify(
                            pendingApplication
                        )
                    );


                    /* Payment method */

                    formData.append(
                        "paymentMethod",
                        paymentMethod.value
                    );


                    /* Transaction/reference */

                    formData.append(
                        "paymentReference",
                        paymentReference.value.trim()
                    );


                    /* Optional message */

                    if (paymentMessage) {

                        formData.append(
                            "message",
                            paymentMessage.value.trim()
                        );

                    }


                    /* Optional proof */

                    if (
                        paymentProof &&
                        paymentProof.files &&
                        paymentProof.files.length > 0
                    ) {

                        formData.append(
                            "paymentProof",
                            paymentProof.files[0]
                        );

                    }


                    /* =================================================
                       SEND TO BACKEND
                    ================================================= */

                    const token =
                        localStorage.getItem("authToken") ||
                        sessionStorage.getItem("authToken");

                    const response =
                        await fetch(
                            PAYMENT_ENDPOINT,
                            {
                                method: "POST",
                                body: formData,
                                headers: {
                                    "Accept":
                                        "application/json",
                                    ...(token
                                        ? {
                                            "Authorization":
                                                `Bearer ${token}`
                                        }
                                        : {})
                                }
                            }
                        );


                    /* =================================================
                       READ SERVER RESPONSE
                    ================================================= */

                    let result = null;


                    try {

                        result =
                            await response.json();

                    } catch (jsonError) {

                        result = null;

                    }


                    /* =================================================
                       BACKEND ERROR
                    ================================================= */

                    if (!response.ok) {

                        throw new Error(
                            result &&
                            result.message
                                ? result.message
                                : "Unable to submit your payment right now. Please try again."
                        );

                    }


                    /* =================================================
                       SUCCESS
                    ================================================= */

                    if (
                        !result ||
                        !result.success
                    ) {

                        throw new Error(
                            result && result.message
                                ? result.message
                                : "Payment submission failed."
                        );

                    }


                    /* Save application ID */

                    if (
                        result.payment &&
                        result.payment.applicationId
                    ) {

                        sessionStorage.setItem(
                            "applicationId",
                            String(
                                result.payment.applicationId
                            )
                        );

                    } else {

                        sessionStorage.setItem(
                            "applicationId",
                            String(applicationId)
                        );

                    }


                    /* Remove temporary application */

                    sessionStorage.removeItem(
                        "pendingApplication"
                    );


                    /* Redirect to success page */

                    window.location.href =
                        "success.html";


                } catch (error) {

                    console.error(
                        "Payment submission error:",
                        error
                    );


                    showMessage(
                        error.message ||
                        "Unable to submit your payment right now. Please try again later.",
                        "error"
                    );


                    /* Restore button */

                    setButtonLoading(
                        false,
                        originalButtonHTML
                    );

                }

            }
        );

    }


    /* =====================================================
       CLEAR ERROR WHEN USER EDITS FORM
    ===================================================== */

    if (paymentReference) {

        paymentReference.addEventListener(
            "input",
            function () {

                if (
                    paymentFormMessage &&
                    paymentFormMessage.classList.contains(
                        "error"
                    )
                ) {

                    clearMessage();

                }

            }
        );

    }


    if (paymentMessage) {

        paymentMessage.addEventListener(
            "input",
            function () {

                if (
                    paymentFormMessage &&
                    paymentFormMessage.classList.contains(
                        "error"
                    )
                ) {

                    clearMessage();

                }

            }
        );

    }


    /* =====================================================
       INITIAL PAYMENT METHOD
    ===================================================== */

    if (
        paymentMethod &&
        ALLOWED_PAYMENT_METHODS.includes(
            paymentMethod.value
        )
    ) {

        showPaymentMethod(
            paymentMethod.value
        );

    } else {

        showPaymentMethod(
            "bitcoin"
        );

    }


    /* =====================================================
       REMOVE USDT FROM ANY OLD PAYMENT ELEMENT
    ===================================================== */

    document
        .querySelectorAll(
            '[data-payment-method="usdt"], [data-panel="usdt"]'
        )
        .forEach(function (element) {

            element.remove();

        });


    /* =====================================================
       FINAL LOG
    ===================================================== */

    console.log(
        "U.S TRAVEL & TOURS payment system initialized."
    );

});
