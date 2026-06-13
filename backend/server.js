require("dotenv").config();

const mysql=require("mysql2");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

app.use(cors());
app.use(express.json());

const rules = [
    {
        keywords: ["crash", "error", "bug", "ne radi"],
        type: "tehnicki problem",
        priority: "visoko",
        reply: "Vidimo da imate tehnicki problem. Molimo pokusajte restart aplikacije ili posaljite dodatne detalje."
    },
    {
        keywords: ["uplata", "placanje", "povratak novca"],
        type: "placanje",
        priority: "srednje",
        reply: "Vas zahtev vezan za placanje je primljen. Nas tim ce ga obraditi uskoro."
    },
    {
        keywords: ["login", "sifra"],
        type: "account problem",
        priority: "srednje",
        reply: "Ako imate problem sa logovanjem, pokusajte reset lozinke ili proverite email."
    }
];

//DB konekcija...
const db = mysql.createConnection({
    host: process.env.DB_HOST || "ai-customer-support-mysql",
    user: "root",
    password: "root",
    port: 3306,
    database: "support_app"
});
db.connect(err =>{
    if(err) {
        console.error ("DB connection error:", err);
    } else {
        console.log("MySQL connected!");
    }
});
//ai odgovor funkcija
async function generateAIResponse(message) {
    const msg = message.toLowerCase();

    for (const rule of rules) {
           if (rule.keywords.some(k => msg.includes(k))) {
               return rule.reply;
           }
    }

    return "Hvala na poruci, nas tim ce vam se javiti uskoro.";
}
//klasifikacija
async function classifyTicket(message) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
Vrati SAMO JSON format:
{
  "type": "bug | billing | login | general",
  "priority": "visoko | srednje | nisko"
}
Bez dodatnog teksta.
                    `
                },
                {
                    role: "user",
                    content: message
                }
            ]
        });

        const raw = response.choices[0].message.content;
        return JSON.parse(raw.trim());

    } catch (err) {
        console.error("Classification error:", err);

        // fallback ako AI pukne
        return {
            type: "generalno",
            priority: "nisko"
        };
    }
}
function getClassification(message) {
    const msg = message.toLowerCase();

    for (const rule of rules) {
        if (rule.keywords.some(k => msg.includes(k))) {
            return {
                type: rule.type,
                priority: rule.priority
            };
        }
    }

    return {
        type: "generalno",
        priority: "nisko"
    };
}
async function sendSlackNotification(ticket) {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text:
`📩 Novi tiket!

Ime: ${ticket.name}
Email: ${ticket.email}
Tip: ${ticket.type}
Prioritet: ${ticket.priority}

Poruka:
${ticket.message}`
        })
    });

    console.log("Slack status:", response.status);
}
//POST je glavni endpoint
app.post("/support", async (req, res) => {
    const { name, email, message } = req.body;

    try {
        const classification = getClassification(message);

        const aiReply = await generateAIResponse(message);

        await sendSlackNotification({
            name,
            email,
            message,
            type: classification.type,
            priority: classification.priority
        });

        const sql = `
            INSERT INTO tickets (name, email, message, status, type, priority)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [name, email, message, "open", classification.type, classification.priority],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ error: err });
                }

                console.log("Novi tiket ID:", result.insertId);

                res.json({
                    success: true,
                    id: result.insertId,
                    reply: aiReply,
                    type: classification.type,
                    priority: classification.priority,
                    debug: {
                        message,
                        aiReply,
                        classification
                    }
                });
            }
        );

    } catch (err) {
        console.error("POST /support error:", err);
        res.status(500).json({ error: "Server error" });
    }
});
// GET je lista tiketa
app.get("/support", (req,res) => {
    db.query("SELECT * FROM tickets", (err, results) => {
        if (err) {
            return res.status(500).json({ error: err});
        }

        res.json(results);
    });
});
app.put("/support/:id", (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    const sql = "UPDATE tickets SET status = ? WHERE id = ?";

    db.query(sql, [status, id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err });
        }

        res.json({
            success: true,
            updatedTicketId: id,
            newStatus: status
        });
    });
});
// startujemo server
app.listen(3000, () => {
    console.log("Server radi na portu 3000");
});