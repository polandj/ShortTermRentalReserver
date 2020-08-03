/* =========================================================
 * Interactive Website 
 * --------------------
 * Presents an interactive page for adding reservation
 * ==========================================================
 */

/* Allows including templates in other templates */
function include(filename) {
  var templ = HtmlService.createTemplateFromFile(filename)
  templ.home_url = ScriptApp.getService().getUrl()
  templ.properties = PropertiesService.getUserProperties()
  templ.gmail_addr = Session.getActiveUser().getEmail()
  return templ.evaluate().getContent()
}

/* Template for a typical styled HTML input field */
function input_field(propname, proplabel, proptype, {
                     maxlength = '', pattern = '', hint = '', required=false} = {}) {
  var templ = HtmlService.createTemplateFromFile('input_field')
  templ.properties = PropertiesService.getUserProperties()
  templ.propname = propname
  templ.proplabel = proplabel
  templ.proptype = proptype
  templ.maxlength = maxlength
  templ.pattern = pattern
  templ.hint = hint
  templ.required = required
  return templ.evaluate().getContent()
}

function getHtml(page) {
  var templ =  HtmlService.createTemplateFromFile(page)
  templ.home_url = ScriptApp.getService().getUrl()
  templ.properties = PropertiesService.getUserProperties()
  templ.gmail_addr = Session.getActiveUser().getEmail()
  return templ.evaluate().getContent()
}

/* The only accessible HTTP endpoint */
function doGet(e) {
  var templ =  HtmlService.createTemplateFromFile(e.parameter.page || 'index')
  templ.home_url = ScriptApp.getService().getUrl()
  templ.properties = PropertiesService.getUserProperties()
  templ.gmail_addr = Session.getActiveUser().getEmail()
  return templ.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
}

/* Called from index.html and  to save a reservation */
function quoteReservation(formObject) {
  var name = formObject.name.trim()
  var email = formObject.email.trim()
  var phone = formObject.phone.trim()
  var adults = formObject.adults.trim()
  var kids = formObject.kids.trim()
  var checkin = formObject.checkin.trim()
  var checkout = formObject.checkout.trim()
  // Basic Validation
  if (!name || name.length < 3) {
    return {status: "error", reason: "Name too short"}
  }
  if (!phone || phone.length < 10) {
    return {status: "error", reason: "Invalid phone"}
  }
  phone = "+1" + phone.replace(/\D/g, '').slice(-10)
  var start_date = new Date(checkin + "T00:00:00")
  var stop_date = new Date(checkout + "T00:00:00")
  var now = new Date()
  if (now > start_date || now > stop_date || start_date >= stop_date) {
    return {status: "error", reason: "Invalid dates"}
  }
  var properties = PropertiesService.getUserProperties()
  checkin_time = properties.getProperty('checkin_time')
  if (checkin_time) {
    var checkin_parts = checkin_time.split(':')
    start_date.setHours(parseInt(checkin_parts[0]))
    start_date.setMinutes(parseInt(checkin_parts[1]))
  } else {
    start_date.setHours(16) // Default: 4pm
  }
  checkout_time = properties.getProperty('checkout_time')
  if (checkout_time) {
    var checkout_parts = checkout_time.split(':')
    stop_date.setHours(parseInt(checkout_parts[0]))
    stop_date.setMinutes(parseInt(checkout_parts[1]))
  } else {
    stop_date.setHours(11) // Default: 11am
  }
  
  // Check for conflicting reservations
  var events = CalendarApp.getDefaultCalendar().getEvents(start_date, stop_date)
  if (events && events.length > 0) {
    return {status: "error", reason: "Conflict with other reservation"}
  }
  
  // Create quote
  var descr = `Guests: ${adults} adults, ${kids} kids\r\nPhone: ${phone}`
  var properties = PropertiesService.getUserProperties()
  var event
  if (properties.getProperty('master_switch') == 'on' || 
      properties.getProperty('admin_phone') == phone) {
    var defcal = CalendarApp.getDefaultCalendar()
    event = defcal.createEvent(name, start_date, stop_date, 
                               {description: descr})
    var mins_til_start = (start_date.getTime() - now.getTime())/1000/60
    event.addEmailReminder(Math.min(mins_til_start - 10, 10080)) // 1 week or a few minutes from now
    console.info("Created " + name + " calendar event: " + checkin + " - " + checkout)
    // Creating the event doesn't trigger a calendar updated trigger?!...Do it manually
    var cal = {calendarId: defcal.getId()}
    calendarUpdated(cal)
  } else {
    console.info("[TESTING] Skipped quoting " + name + " event: " + checkin + " - " + checkout)
  }
  
  var settings = getSheetSettings()
  var input = {}
  input.name = name
  input.email = email
  input.phone = phone
  input.adults = adults
  input.kids = kids
  input.checkin = checkin
  input.checkout = checkout
  var quote = {}
  quote.nights = ((stop_date - start_date)/86400000).toFixed(0)
  quote.customer = getWaveCustomer(email)
  if (Object.keys(quote.customer).length !== 0) {
    quote.customer_discount = settings.CUSTOMER_DISCOUNT
  } else {
    quote.customer_discount = 0
  }
  quote.cleaning_fee = settings.CLEANING_FEE
  quote.rent = quote.nights * settings.NIGHTLY_RATE
  quote.tax = (quote.rent - quote.customer_discount) * 0.06
  quote.total = (quote.rent - quote.customer_discount) + quote.tax + quote.cleaning_fee
  
  var ret = {status: "quoted", quote: quote, input: input}
  
  addSheetQuote(ret)
  return ret
}

function createCustomer(result) {
  console.info(`Create customer ${result.input.name}`)
  var customer = createWaveCustomer(result.input)
  result.customer = customer
  return result 
}

function createInvoice(result) {
  console.info(`Create invoice ${result.input.name} for ${result.quote.total} (Customer ${result.customer.id})`)
  // Create it
  var invoice = createWaveInvoice(result.input, result.quote, result.customer)
  
  // Send it
  if (!markWaveInvoiceSent(invoice)) {
    console.log("Error marking invoice as sent")
  }
  addSheetBooking(result)
  
  result.invoice = invoice
  return result
}
 
function isInvoicePaid(result) {
  console.info(`Checking if invoice is paid`)
  result.isPaid = waveInvoiceIsPaid(result.invoice)
  return result
}

/*
Copyright(c) 2020 - Jonathan Poland (polandj@garble.org)
All Rights reserved

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google LLC nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

