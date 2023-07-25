const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
var fs = require("fs");
var pdf = require("pdf-creator-node");
var nodemailer = require('nodemailer');
const mailcomposer = require("nodemailer/lib/mail-composer");
var JsBarcode = require('jsbarcode');

var AWS = require('aws-sdk');
AWS.config = new AWS.Config();
AWS.config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
AWS.config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
AWS.config.update({ region: 'us-east-1' });

const app = express();


var options = {
    format: "A3",
    orientation: "portrait",
    border: "10mm",
    header: {
        height: "45mm",
        contents: '<div style="text-align: center;"></div>'
    },
    footer: {
        height: "28mm",
        contents: {
            first: '1',
            2: 'Second page', // Any page number is working. 1-based index
            default: '<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>', // fallback value
            last: 'Last Page'
        }
    },
    childProcessOptions: {
        env: {
          OPENSSL_CONF: '/dev/null',
        },
    }
};



const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './file')
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname)
    }
})

app.use(multer({ storage: fileStorage }).any('files'));
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json()); 

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization,skip, Content-Length, X-Requested-With');
    next();
});

app.get('/', (req,res)=>{
    res.send({'data' : 'app running'});
});

app.post('/send', async(req, res) => {

    var request= req.body.request;
    var pan= req.body.pan;
    var name= req.body.name;
    var rut= req.body.rut;
    var email= req.body.email;
    var amount= req.body.amount;
    var exp= req.body.exp;
    var pin= req.body.pin;

    var mailHtml = generateMail(name, amount, exp, pan, pin);
    var documentId = Date.now().toString() + "-" + pan.trim();
    var mailFrom = process.env.MAIL_SOURCE;
    var path = "./file/" + documentId + ".pdf";
    var html = await (await generateDocuments(pan, pin, exp, name, amount, rut)).toString();
    console.log('data generated');

    console.log(documentId);
    console.log('crear doc');
    var path = './file/' + documentId.trim() + '.pdf';
    var document = {
        html: html,
        data: {
        },
        path: path,
        type: "",
    }; 
    const doc =  await pdf.create(document, options);
    console.log('Doc creado:' + document);
    AwsRequest(request, name, pan, mailFrom, email, 'Gift Card', mailHtml, '', path, res );
    
  });

//genera el HTML para enviar el correo con formato.
function generateMail(Name, Amount, exp, PAN, pin) {
    try {
        //Da formato al PAN
        PAN = PAN.substring(0, 4) + " " + PAN.substring(4, 8) + " " + PAN.substring(8, 12) + " " + PAN.substring(12, 16);
        // Da formato a la F.Exp
        exp = exp.substring(6, 8) + "-" + exp.substring(4, 6) + "-" + exp.substring(0, 4);
        // Da formato al Montos
        Amount = parseFloat(Amount).toLocaleString("es");
        // Formatea fecha actual
        var current_Date = formartCurrentDate();
        const data = fs.readFileSync('./assets/email.txt', 'utf8');
        var replaced = data.replace(process.env.AMOUNT_REPLACE, Amount);
        replaced = replaced.replace(process.env.NAME_REPLACE, Name);
        replaced = replaced.replace(process.env.EXP_REPLACE, exp);
        replaced = replaced.replace(process.env.PAN_REPLACE, PAN);
        replaced = replaced.replace(process.env.PIN_REPLACE, pin);
        replaced = replaced.replace(process.env.CURRENT_DATE, current_Date);

        return replaced;
    } catch (err) {
        console.error(err);
    }
}  

//Funcion que genera el PDF con el Gift Card.
async function generateDocuments(Pan, pin, Expiration, Name, Amount, Rut) {
    var doc;
    try {
        doc = fs.readFileSync('./assets/doc.txt', 'utf8');
    } catch (err) {
        return 'Error';
    }

    var barcode = await createBarcode(Pan);
    // Da formato al PAN
    Pan = Pan.substring(0, 4) + " " + Pan.substring(4, 8) + " " + Pan.substring(8, 12) + " " + Pan.substring(12, 16);
    // Da formato a la F.Exp
    Expiration = Expiration.substring(6, 8) + "-" + Expiration.substring(4, 6) + "-" + Expiration.substring(0, 4);
    // Da formato al Montos
    Amount = parseFloat(Amount).toLocaleString("es");
    var current_Date = formartCurrentDate();
    var replaced = doc.replace(process.env.AMOUNT_REPLACE, Amount);
    replaced = replaced.replace(process.env.BCODE_REPLACE, barcode);
    replaced = replaced.replace(process.env.PAN_REPLACE, Pan);
    replaced = replaced.replace(process.env.PIN_REPLACE, pin);
    replaced = replaced.replace(process.env.CURRENT_DATE, current_Date);
    replaced = replaced.replace(process.env.EXP_REPLACE, Expiration);
    replaced = replaced.replace(process.env.RUT, Rut);
    replaced = replaced.replace(process.env.NAME_REPLACE, Name);
    replaced = replaced.replace(process.env.NAME_REPLACE, Name);
    return replaced;
}

// funcion que da formato de la pantilla a la fecha del cuerpo del correo
function formartCurrentDate(params) {
    const d = new Date();
    let day = d.getDay();
    let month = d.getMonth();
    var text = "";

    switch (day) {
        case 0:
            text = "Dom, " + d.getDate();
            break;
        case 1:
            text = "Lun, " + d.getDate();
            break;
        case 2:
            text = "Mar, " + d.getDate();
            break;
        case 3:
            text = "Mié, " + d.getDate();
            break;
        case 4:
            text = "Jue, " + d.getDate();
            break;
        case 5:
            text = "Vie, " + d.getDate();
            break;
        case 6:
            text = "Sab, " + d.getDate();
            break;
    }

    switch (month) {
        case 0:
            text += " de Enero";
            break;
        case 1:
            text += " de Febrero";
            break;
        case 2:
            text += " de Marzo";
            break;
        case 3:
            text += " de Abril";
            break;
        case 4:
            text += " de Mayo";
            break;
        case 5:
            text += " de Junio";
            break;
        case 6:
            text += " de Julio";
            break;
        case 7:
            text += " de Agosto";
            break;
        case 8:
            text += " de Septiembre";
            break;
        case 9:
            text += " de Octubre";
            break;
        case 10:
            text += " de Noviembre";
            break;
        case 11:
            text += " de Diciembre";
            break;
    }

    return text;
}

//Funcion que crea el codigo de barras del Gift Card.
async function createBarcode(CodeValue) {
    const { DOMImplementation, XMLSerializer } = require('xmldom');
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument('http://www.w3.org/1999/xhtml', 'html', null);
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, CodeValue, {
        xmlDocument: document,
        displayValue: false
    });
    var svgText = xmlSerializer.serializeToString(svgNode);

    return svgText;
}
//funcion encarga de realizar el peticion al servicio de AWS con las credenciales.
async function AwsRequest(request, Name, PAN, mailFrom, mailDestination, mailSubject, mailBodyHtml, MailBodyTxt, mailAttatched, res) {

    const mail = new mailcomposer({
        from: mailFrom,
        to: mailDestination,
        subject: mailSubject,
        html: mailBodyHtml,
        text: MailBodyTxt,
        attachments: [
            {
                path: mailAttatched.toString()
            },
        ],
    });


    mail.compile().build(function (err, message) {

        if (err) {
            console.log('error contruyendo raw email');
            console.error(err, err.stack);
        } else {
            console.log('correo construido');
            return new AWS.SES().sendRawEmail({
                RawMessage: { Data: message }
            }).promise().then(
                function (data) {
                    console.log("Correo enviado con exito " + mailDestination + ". Id del correo:")
                    console.log(data.MessageId);
                    res.send({'data' : data.MessageId});
                    fs.unlinkSync(mailAttatched.toString());
                }
            ).catch(
                function (err) {
                    console.log("Error al enviar el correo");
                    res.status(406).send({'data' : 'SE'});
                    
                }
            );
        }

    }); 

} 

const PORT =  8080;
app.listen(PORT, ()=>{
    console.log("Server Running");
});