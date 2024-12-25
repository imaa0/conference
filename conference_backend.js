// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());

// Database connection
const pool = mysql.createPool({
    host: 'localhost',      // Your MySQL host
    user: 'root',           // MySQL username (default is 'root')
    password: '',           // MySQL password (leave empty if none is set)
    database: 'conference_db', // Your database name
    port: 3000             // MySQL default port
});

app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS result');
        res.status(200).json({ success: true, result: rows[0].result });
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ success: false, error: 'Database connection failed' });
    }
});




// Email setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your_email@gmail.com',
        pass: 'your_email_password',
    },
});

// API Endpoints

// Register participant
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const qrData = `${name}\n${email}`;
        const qrCode = await QRCode.toDataURL(qrData);

        const query = 'INSERT INTO participants (name, email, password_hash, qr_code) VALUES (?, ?, ?, ?)';
        const [result] = await pool.query(query, [name, email, passwordHash, qrCode]);

        // Send QR Code via email
        await transporter.sendMail({
            from: 'your_email@gmail.com',
            to: email,
            subject: 'Your Conference Registration QR Code',
            html: `<h1>Welcome to the Conference!</h1><p>Here is your QR Code:</p><img src="${qrCode}" />`,
        });

        res.status(201).json({ message: 'Registration successful', participant_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error registering participant' });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await pool.query('SELECT * FROM participants WHERE email = ?', [email]);
        const participant = rows[0];

        if (!participant || !(await bcrypt.compare(password, participant.password_hash))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        res.status(200).json({ message: 'Login successful', participant });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error during login' });
    }
});

// Get schedule
app.get('/schedule', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tracks_sessions');
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching schedule' });
    }
});

// Register for a session
app.post('/register-session', async (req, res) => {
    const { participant_id, session_id } = req.body;

    try {
        const query = 'UPDATE participants SET sessions_registered = IFNULL(CONCAT(sessions_registered, ?, ","), ?) WHERE participant_id = ?';
        await pool.query(query, [session_id, session_id, participant_id]);
        res.status(200).json({ message: 'Session registration successful' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error registering for session' });
    }
});

// QR Check-in
app.post('/check-in', async (req, res) => {
    const { participant_id, session_id } = req.body;

    try {
        const query = 'INSERT INTO attendance (participant_id, session_id) VALUES (?, ?)';
        await pool.query(query, [participant_id, session_id]);
        res.status(200).json({ message: 'Check-in successful' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error during check-in' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
