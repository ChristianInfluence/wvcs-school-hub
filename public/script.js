const CORS_PROXY = "https://comments.javajireh.org/";
const STUDENT_FETCH_URL = "https://script.google.com/macros/s/AKfycbx3cin8FE2bnGTt7L4lc_nAjI8_MHTsO7h6HhWbqtiCn-BPTH0avHLHjMbiIlDvoaJV/exec";
const SUBMIT_DATA_URL = "https://script.google.com/macros/s/AKfycbyXpsGjiDzqSGtnwDFXC4ROKG1lMN03DFJiOTZmMYoRTZwSxnZXFv6ZIfnoNobNFN26eA/exec";

let teacherEmail = "";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCNiTePPQhs4vj2-JDABiJDaLd-Rs4IPc",
  authDomain: "student-probation.firebaseapp.com",
  projectId: "student-probation",
  storageBucket: "student-probation.firebasestorage.app",
  messagingSenderId: "619429980328",
  appId: "1:619429980328:web:a9ca96ad124c334730fa9d",
  measurementId: "G-CBP9LPZQRW"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase Authentication
const auth = firebase.auth();

auth.onAuthStateChanged(user => {
  if (user) {
    // User is signed in.
    teacherEmail = user.email;
    const domain = teacherEmail.split('@')[1];
    if (domain === 'wvcs.org') {
      document.getElementById('content').style.display = 'block';
      document.getElementById('login').style.display = 'none';
      fetchStudents(); // Fetch students after successful login
    } else {
      auth.signOut();
      alert('Unauthorized domain.');
    }
  } else {
    // No user is signed in.
    document.getElementById('content').style.display = 'none';
    document.getElementById('login').style.display = 'block';
  }
});

function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(error => {
    console.error(error);
  });
}

// Fetch students from "New Student Probation" sheet
function fetchStudents() {
    fetch(CORS_PROXY + STUDENT_FETCH_URL)
    .then(response => {
        console.log("Response from fetch:", response); // Add extra debugging information
        if (!response.ok) {
            throw new Error("Network response was not ok: " + response.statusText);
        }
        return response.text(); // Return as text to log it
    })
    .then(responseText => {
        console.log("Response text:", responseText); // Log the text response
        try {
            const studentNames = JSON.parse(responseText); // Attempt to parse JSON
            console.log("Fetched students:", studentNames); // Debugging

            let select = document.getElementById("studentSelect");
            select.innerHTML = '<option value="" disabled selected>None selected</option>'; // Clear old options and set default

            if (studentNames.length === 0) {
                let option = document.createElement("option");
                option.textContent = "No students available";
                option.disabled = true;
                option.selected = true;
                select.appendChild(option);
            } else {
                studentNames.forEach(name => {
                    let option = document.createElement("option");
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });
            }

            document.getElementById("content").style.display = "block"; // Show the form
        } catch (error) {
            console.error("Error parsing JSON:", error);
            alert("Error parsing student names: " + error.message);
        }
    })
    .catch(error => {
        console.error("Error fetching student names:", error);
        alert("Error fetching student names: " + error.message);
    });
}

// Update slider value display with gradient color
function updateValue(sliderId) {
    const value = document.getElementById(sliderId).value;
    const valueDisplay = document.getElementById(sliderId + 'Value');
    valueDisplay.innerText = value;
    valueDisplay.setAttribute('data-value', value);
}

// Submit evaluation data to "Probation Log 2025" sheet
function submitEvaluation() {
    let student = document.getElementById("studentSelect").value;
    let academics = document.getElementById("academics").value;
    let integration = document.getElementById("integration").value;
    let behavior = document.getElementById("behavior").value;
    let attendance = document.getElementById("attendance").value;
    let feedback = document.getElementById("feedback").value;

    if (!student || !academics || !integration || !behavior || !attendance || !feedback) {
        alert("All fields are required!");
        return;
    }

    let data = {
        email: teacherEmail,
        student: student,
        academics: academics,
        integration: integration,
        behavior: behavior,
        attendance: attendance,
        feedback: feedback
    };

    // Show loading spinner
    document.getElementById('loading').style.display = 'block';

    fetch(CORS_PROXY + SUBMIT_DATA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    })
    .then(response => response.text())
    .then(result => {
        console.log("Submission response:", result);
        
        // Hide loading spinner
        document.getElementById('loading').style.display = 'none';
        
        // Show success message
        const messageDiv = document.getElementById('message');
        messageDiv.innerText = result;
        messageDiv.style.backgroundColor = '#4CAF50'; // Success color
        messageDiv.style.display = 'block';

        // Reset the form after successful submission
        document.getElementById("studentSelect").selectedIndex = 0;
        document.getElementById("academics").value = 5;
        document.getElementById("integration").value = 5;
        document.getElementById("behavior").value = 5;
        document.getElementById("attendance").value = 5;
        document.getElementById("feedback").value = "";
        updateValue('academics');
        updateValue('integration');
        updateValue('behavior');
        updateValue('attendance');

        // Hide message after 5 seconds
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    })
    .catch(error => {
        console.error("Error submitting evaluation:", error);

        // Hide loading spinner
        document.getElementById('loading').style.display = 'none';
        
        // Show error message
        const messageDiv = document.getElementById('message');
        messageDiv.innerText = 'Error submitting evaluation: ' + error.message;
        messageDiv.style.backgroundColor = '#FF0000'; // Error color
        messageDiv.style.display = 'block';

        // Hide message after 5 seconds
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    });
}

// Attach event listener to login button
document.getElementById("loginButton").addEventListener("click", login);

// Attach event listener to submit button
document.getElementById("submitButton").addEventListener("click", submitEvaluation);
