// =========================================================
// U.S TRAVEL & TOURS
// APPLICATION FORM
// =========================================================

const APPLICATION_ENDPOINT =
    "https://u-s-travel-tours-1.onrender.com/api/applications";

document.addEventListener("DOMContentLoaded", function () {

    const form = document.getElementById("applicationForm");

    if (!form) {
        return;
    }

    const submitBtn =
        document.getElementById("applicationSubmitBtn");

    // =====================================================
    // GET AUTH TOKEN
    // =====================================================

    function getAuthToken() {

        return (
            localStorage.getItem("authToken") ||
            sessionStorage.getItem("authToken") ||
            ""
        );

    }

    // =====================================================
    // READ FIELD VALUE
    // =====================================================

    function getValue(id) {

        const element = document.getElementById(id);

        if (!element) {
            return "";
        }

        return String(element.value || "").trim();

    }

    // =====================================================
    // READ RADIO VALUE
    // =====================================================

    function getRadioValue(name) {

        const selected =
            document.querySelector(
                `input[name="${name}"]:checked`
            );

        return selected ? selected.value : "";

    }

    // =====================================================
    // READ APPLICANT PHOTO
    // =====================================================

    async function getApplicantPhoto() {

        const input =
            document.getElementById("applicantPhoto");

        if (
            !input ||
            !input.files ||
            !input.files[0]
        ) {
            return "";
        }

        const file = input.files[0];

        return new Promise((resolve) => {

            const reader = new FileReader();

            reader.onload = function () {

                resolve(reader.result || "");

            };

            reader.onerror = function () {

                resolve("");

            };

            reader.readAsDataURL(file);

        });

    }

    // =====================================================
    // SHOW MESSAGE
    // =====================================================

    function showMessage(message) {

        alert(message);

    }

    // =====================================================
    // SUBMIT APPLICATION
    // =====================================================

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        const token = getAuthToken();

        if (!token) {

            showMessage(
                "Please login before submitting your application."
            );

            window.location.href = "login.html";

            return;

        }

        // =================================================
        // GET ALL FORM VALUES
        // =================================================

        const passportNumber =
            getValue("passportNumber");

        const passportIssuingCountry =
            getValue("passportIssuingCountry");

        const passportIssueDate =
            getValue("passportIssueDate");

        const passportExpiryDate =
            getValue("passportExpiryDate");

        const surname =
            getValue("surname");

        const firstMiddleName =
            getValue("firstMiddleName");

        const otherSurnames =
            getValue("otherSurnames");

        const otherFirstMiddleNames =
            getValue("otherFirstMiddleNames");

        const dateOfBirth =
            getValue("dateOfBirth");

        const birthCity =
            getValue("birthCity");

        const birthCountry =
            getValue("birthCountry");

        const birthState =
            getValue("birthState");

        const nationality =
            getValue("nationality");

        const sex =
            getRadioValue("sex");

        const nationalId =
            getValue("nationalId");

        const homeAddress =
            getValue("homeAddress");

        const homeCity =
            getValue("homeCity");

        const homeState =
            getValue("homeState");

        const postalCode =
            getValue("postalCode");

        const homeCountry =
            getValue("homeCountry");

        const homePhone =
            getValue("homePhone");

        const businessPhone =
            getValue("businessPhone");

        const mobilePhone =
            getValue("mobilePhone");

        const faxNumber =
            getValue("faxNumber");

        const maritalStatus =
            getRadioValue("maritalStatus");

        const spouseName =
            getValue("spouseName");

        const spouseDob =
            getValue("spouseDob");

        const employerSchool =
            getValue("employerSchool");

        const presentOccupation =
            getValue("presentOccupation");

        const employerAddress =
            getValue("employerAddress");

        const usArrivalDate =
            getValue("usArrivalDate");

        const visaEmail =
            getValue("visaEmail");

        const usStayAddress =
            getValue("usStayAddress");

        const usContactName =
            getValue("usContactName");

        const usContactPhone =
            getValue("usContactPhone");

        const stayDuration =
            getValue("stayDuration");

        const tripPurpose =
            getValue("tripPurpose");

        const usContactBusinessPhone =
            getValue("usContactBusinessPhone");

        const usContactCellPhone =
            getValue("usContactCellPhone");

        const tripPaidBy =
            getValue("tripPaidBy");

        const previousUsVisit =
            getRadioValue("previousUsVisit");

        const previousUsWhen =
            getValue("previousUsWhen");

        const previousUsDuration =
            getValue("previousUsDuration");

        // =================================================
        // CHECK REQUIRED FIELDS
        // EXACTLY MATCHING BACKEND
        // =================================================

        const requiredFields = {

            passportNumber,
            passportIssuingCountry,
            passportIssueDate,
            passportExpiryDate,

            surname,
            firstMiddleName,

            dateOfBirth,
            birthCity,
            birthCountry,
            nationality,
            sex,

            homeAddress,
            homeCity,
            homeCountry,
            mobilePhone,

            maritalStatus,

            employerSchool,
            presentOccupation,

            usArrivalDate,
            visaEmail,
            usStayAddress,
            usContactName,
            stayDuration,
            tripPurpose,

            tripPaidBy,

            previousUsVisit

        };

        const missingFields = Object.keys(
            requiredFields
        ).filter(function (field) {

            return !requiredFields[field];

        });

        if (missingFields.length > 0) {

            showMessage(
                "Please complete all required application fields."
            );

            return;

        }

        // =================================================
        // APPLICANT PHOTO
        // =================================================

        const applicantPhoto =
            await getApplicantPhoto();

        // =================================================
        // IMPORTANT:
        // SEND FLAT DATA
        // BACKEND EXPECTS THESE FIELD NAMES DIRECTLY
        // =================================================

        const applicationData = {

            applicationType:
                "U.S. Travel & Tours Application",

            submittedAt:
                new Date().toISOString(),

            applicantPhoto,

            passportNumber,
            passportIssuingCountry,
            passportIssueDate,
            passportExpiryDate,

            surname,
            firstMiddleName,
            otherSurnames,
            otherFirstMiddleNames,

            dateOfBirth,
            birthCity,
            birthCountry,
            birthState,
            nationality,
            sex,
            nationalId,

            homeAddress,
            homeCity,
            homeState,
            postalCode,
            homeCountry,
            homePhone,
            businessPhone,
            mobilePhone,
            faxNumber,

            maritalStatus,
            spouseName,
            spouseDob,

            employerSchool,
            presentOccupation,
            employerAddress,

            usArrivalDate,
            visaEmail,
            usStayAddress,
            usContactName,
            usContactPhone,
            stayDuration,
            tripPurpose,
            usContactBusinessPhone,
            usContactCellPhone,

            tripPaidBy,

            previousUsVisit,
            previousUsWhen,
            previousUsDuration,

            consent: true

        };

        // =================================================
        // CHECK PAYLOAD SIZE
        // BACKEND LIMIT = 1 MB
        // =================================================

        const payloadSize =
            new Blob([
                JSON.stringify(applicationData)
            ]).size;

        if (payloadSize > 900000) {

            showMessage(
                "Application photo is too large. Please select a smaller image."
            );

            return;

        }

        // =================================================
        // BUTTON LOADING
        // =================================================

        const originalButtonHTML =
            submitBtn
                ? submitBtn.innerHTML
                : "";

        if (submitBtn) {

            submitBtn.disabled = true;

            submitBtn.innerHTML =
                '<span>Submitting...</span>';

        }

        try {

            // =================================================
            // SEND APPLICATION TO BACKEND
            // =================================================

            const response = await fetch(
                APPLICATION_ENDPOINT,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify(
                            applicationData
                        )
                }
            );

            let result = {};

            try {

                result =
                    await response.json();

            } catch (error) {

                result = {};

            }

            // =================================================
            // BACKEND ERROR
            // =================================================

            if (
                !response.ok ||
                !result.success
            ) {

                showMessage(
                    result.message ||
                    "Unable to submit application. Please try again."
                );

                return;

            }

            // =================================================
            // SAVE APPLICATION FOR PAYMENT PAGE
            // =================================================

            const pendingApplication = {

                applicationId:
                    result.applicationId,

                status:
                    result.status,

                applicationData

            };

            sessionStorage.setItem(
                "pendingApplication",
                JSON.stringify(
                    pendingApplication
                )
            );

            // =================================================
            // SAVE APPLICATION ID
            // =================================================

            if (result.applicationId) {

                sessionStorage.setItem(
                    "applicationId",
                    String(
                        result.applicationId
                    )
                );

            }

            // =================================================
            // GO TO PAYMENT PAGE
            // =================================================

            window.location.href =
                "payments.html";

        } catch (error) {

            console.error(
                "Application submission error:",
                error
            );

            showMessage(
                "Unable to submit application. Please check your internet connection and try again."
            );

        } finally {

            if (submitBtn) {

                submitBtn.disabled = false;

                submitBtn.innerHTML =
                    originalButtonHTML;

            }

        }

    });

});
