const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { MongoClient, GridFSBucket } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./Database/model/users');
const app = express();
const sharp = require('sharp');
const port = 3001;
const mongoURI = 'mongodb+srv://RajLakkad:rajlakkad1234@cluster0.eavid.mongodb.net/Event-ticket-booking?retryWrites=true&w=majority&ssl=true&tlsAllowInvalidCertificates=true';

const jwtSecret = 'your-secret-key';

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });


mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));


// Event Schema
const eventSchema = new mongoose.Schema({
  title: String,
  date: Date,
  location: String,
  description: String,
  price:Number,
  image: String
});

const client = new MongoClient(mongoURI);
let gfs;

client.connect().then(() => {
  const db = client.db();
  gfs = new GridFSBucket(db, { bucketName: 'uploads' });
}).catch(err => console.error('GridFSBucket connection error:', err));


const Event = mongoose.model('Event', eventSchema);


// Create Event
app.post('/api/events', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ msg: 'No file uploaded' });
  }

  try {
    // Compress the image using sharp
    const compressedImage = await sharp(req.file.buffer)
      .resize({ width: 800 }) // Resize the image to 800px width, maintain aspect ratio
      .jpeg({ quality: 80 }) // Convert to JPEG and set quality to 80%
      .toBuffer();

    // Upload the compressed image to GridFS
    const uploadStream = gfs.openUploadStream(req.file.originalname, { contentType: 'image/jpeg' });
    uploadStream.end(compressedImage);

    uploadStream.on('finish', async () => {
      try {
        const newEvent = new Event({
          title: req.body.title,
          date: req.body.date,
          location: req.body.location,
          description: req.body.description,
          price:req.body.price,
          image: req.file.originalname
        });

        await newEvent.save();
        res.json({ message: 'Event created successfully!', event: newEvent });
      } catch (err) {
        res.status(500).json({ message: 'Failed to create event', error: err.message });
      }
    });

    uploadStream.on('error', (err) => {
      res.status(500).json({ message: 'Failed to upload file', error: err.message });
    });

  } catch (err) {
    res.status(500).json({ message: 'Image processing failed', error: err.message });
  }
});


// Fetch Event Image
app.get('/file/:filename', (req, res) => {
  const downloadStream = gfs.openDownloadStreamByName(req.params.filename);

  downloadStream.on('data', (chunk) => {
    res.write(chunk);
  });

  downloadStream.on('end', () => {
    res.end();
  });

  downloadStream.on('error', () => {
    res.status(404).json({ err: 'No file exists' });
  });
});

// Fetch All Events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find();
    const eventsWithImages = events.map(event => ({
      ...event._doc,
      imageUrl: `http://localhost:3001/file/${event.image}`
    }));
    res.json(eventsWithImages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch events', error: err.message });
  }
});

// Signup Route
app.post('/signup', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Error during signup:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Login Route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign(
        {
          userId: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        jwtSecret,
        { expiresIn: '1h' }
      );
      res.json({ token });
    } else {
      res.status(401).json({ message: 'Authentication failed' });
    }
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  // Add any additional fields you need
});

const Booking = mongoose.model('Booking', bookingSchema);

// API route to handle booking
app.post('/api/book/:eventId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const eventId = req.params.eventId;

    // Create a new booking
    const booking = new Booking({
      userId,
      eventId
      // Add additional fields if necessary
    });

    await booking.save();
    res.status(201).json({ message: 'Booking successful', booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});
 // Get bookings for the logged-in user
app.get('/api/bookings', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId; // Get userId from the decoded token

    // Find bookings for this user and populate eventId
    const bookings = await Booking.find({ userId }).populate('eventId');
    res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Fetch User Profile and Added Events
app.get('/api/user/events', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    // Find bookings for this user and populate eventId
    const bookings = await Booking.find({ userId }).populate('eventId');

    // Extract event details from bookings
    const userEvents = bookings.map(booking => {
      return {
        eventId: booking.eventId._id,
        title: booking.eventId.title,
        date: booking.eventId.date,
        location: booking.eventId.location,
        description: booking.eventId.description,
        price: booking.eventId.price,
        imageUrl: `http://localhost:3001/file/${booking.eventId.image}`
      };
    });

    res.json(userEvents);
  } catch (err) {
    console.error('Error fetching user events:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// API route to handle event deletion
app.delete('/api/user/events/:eventId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const eventId = req.params.eventId;

    // Find the booking associated with this user and eventId
    const booking = await Booking.findOneAndDelete({ userId, eventId });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.status(200).json({ message: 'Event removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});


// Fetch User Profile and Booked Events

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
