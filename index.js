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

const axios = require('axios');
const crypto = require('crypto');

const { v4: uuidv4 } = require('uuid');

const BookedTicket = require('./Database/model/BookedTicket'); // Assuming you have an Event model for booked events


const MERCHANT_KEY = "96434309-7796-489d-8924-ab56988a6076";
const MERCHANT_ID = "PGTESTPAYUAT86";
const MERCHANT_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";
const MERCHANT_STATUS_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status";
const redirectUrl = "http://localhost:3001/status";
const successUrl = "http://localhost:3000/payment-successful";
const failureUrl = "http://localhost:3000/payment-failed";








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


app.post('/create-order', async (req, res) => {
    const { name, email, amount, eventId, numberOfTickets ,imageUrl} = req.body; // Get numberOfTickets from the request
    const orderId = uuidv4();

    // Payment payload
    const paymentPayload = {
        merchantId: MERCHANT_ID,
        merchantUserId: name,
        mobileNumber: '9510268400', // Ideally, this should come from the user's profile
        amount: amount * 100, // Convert to paisa
        merchantTransactionId: orderId,
        redirectUrl: `${redirectUrl}/?id=${orderId}&amount=${amount}&email=${email}&eventId=${eventId}&imageUrl=${imageUrl}&numberOfTickets=${numberOfTickets}`, // Pass eventId
        redirectMode: 'POST',
        paymentInstrument: {
            type: 'PAY_PAGE'
        }
    };

    const payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
    const keyIndex = 1;
    const string = payload + '/pg/v1/pay' + MERCHANT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = sha256 + '###' + keyIndex;

    const option = {
        method: 'POST',
        url: MERCHANT_BASE_URL,
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'X-VERIFY': checksum
        },
        data: {
            request: payload
        }
    };

    try {
        const response = await axios.request(option);
        res.status(200).json({
            msg: "OK",
            url: response.data.data.instrumentResponse.redirectInfo.url
        });
    } catch (error) {
        console.error("Error in payment", error);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

app.post('/status', async (req, res) => {
    const merchantTransactionId = req.query.id;
    const amount = req.query.amount;
    const email = req.query.email;
    const eventId = req.query.eventId; // Get eventId from query parameters
    const imageUrl = req.query.imageUrl; // Get eventId from query parameters
    const numberOfTickets = req.query.numberOfTickets; // Get eventId from query parameters

    


    const keyIndex = 1;
    const string = `/pg/v1/status/${MERCHANT_ID}/${merchantTransactionId}` + MERCHANT_KEY;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const checksum = sha256 + '###' + keyIndex;

    const option = {
        method: 'GET',
        url: `${MERCHANT_STATUS_URL}/${MERCHANT_ID}/${merchantTransactionId}`,
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': MERCHANT_ID
        },
    };

  
    try {
        const response = await axios.request(option);

        if (response.data.success === true) {
            // Save booked event in the database
            const bookedTicket = new BookedTicket({
                email: email, // Use email as the unique identifier
                event: eventId, // Save event ID
                numberOfTickets: numberOfTickets, // Get the number of tickets booked
                totalPrice: amount ,// Total amount for the booking
                imageUrl: imageUrl // Total amount for the booking
            });

            await bookedTicket.save(); // Save the booked ticket

            return res.redirect(successUrl);
        } else {

            return res.redirect(failureUrl);
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
        res.status(500).json({ error: 'Failed to check payment status' });
    }
});

app.get('/booked-tickets', async (req, res) => {
  const email = req.query.email;

  try {
    const bookedTickets = await BookedTicket.find({ email: email })
      .populate('event') // Populate event details
      .exec();

    const ticketsWithImages = bookedTickets.map(ticket => ({
      ...ticket._doc,
      imageUrl: ticket.imageUrl // Add the image URL from the booked ticket
    }));

    res.status(200).json(ticketsWithImages);
  } catch (error) {
    console.error("Error fetching booked tickets:", error);
    res.status(500).json({ error: 'Failed to fetch booked tickets' });
  }
});


app.put('/update/:id', async (req, res) => {
  const { id } = req.params;
  const { title, date, location, description, price } = req.body; // Exclude image

  try {
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      {
        title,
        date,
        location,
        description,
        price
      },
      { new: true } // To return the updated document
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.status(200).json({ message: 'Event updated successfully', updatedEvent });
  } catch (error) {
    res.status(500).json({ message: 'Error updating event', error });
  }
});





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
      .resize({ width: 800 }) 
      .jpeg({ quality: 80 })
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
      res.status(401).json({ message: 'Email or Password is not currect' });
    }
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
 
});

const Booking = mongoose.model('Booking', bookingSchema);

app.post('/api/book/:eventId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const eventId = req.params.eventId;

    // Check if the booking already exists for this user and event
    const existingBooking = await Booking.findOne({ userId, eventId });
    if (existingBooking) {
      return res.status(400).json({ message: 'Event is already in your wishlist' });
    }

    // Create a new booking if it doesn't exist
    const booking = new Booking({
      userId,
      eventId
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

   
    const bookings = await Booking.find({ userId }).populate('eventId');

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
app.delete('/api/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    await EventModel.findByIdAndDelete(eventId);
    res.status(200).send({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Error deleting event' });
  }
});




app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
