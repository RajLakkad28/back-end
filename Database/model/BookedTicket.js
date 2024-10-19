// Database/model/bookedTicket.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the booked ticket schema
const bookedTicketSchema = new Schema({
    email: {
        type: String,
        required: true,
       
    },
    event: {
        type: Schema.Types.ObjectId,
        ref: 'Event', // Reference to the Event model
        required: true
    },
    numberOfTickets: {
        type: Number,
        required: true,
        min: 1
    },
    totalPrice: {
        type: Number,
        required: true
    },
    bookingDate: {
        type: Date,
        default: Date.now
    },imageUrl:{
        type:String,
    }
});

// Create the BookedTicket model
const BookedTicket = mongoose.model('BookedTicket', bookedTicketSchema);

module.exports = BookedTicket;
