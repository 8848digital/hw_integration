frappe.provide("hwi")

class HWIntegration {
    qz_connect() {
        return new Promise(function (resolve, reject) {
            if (qz.websocket.isActive()) {
                // if already active, resolve immediately
                frappe.show_alert({message: __('QZ Tray Connection Active!'), indicator: 'green'});
                resolve();
            } else {
                // try to connect once before firing the mimetype launcher
                frappe.show_alert({
                    message: __("Attempting Connection to QZ Tray..."),
                    indicator: "blue",
                });
                qz.websocket.connect().then(
                    () => {
                        frappe.show_alert({
                            message: __("Connected to QZ Tray!"),
                            indicator: "green",
                        });
                        resolve();
                    },
                    function retry(err) {
                        if (err.message === "Unable to establish connection with QZ") {
                            // if a connect was not successful, launch the mimetype, try 3 more times
                            frappe.show_alert(
                                {
                                    message: __("Attempting to launch QZ Tray..."),
                                    indicator: "blue",
                                },
                                14
                            );
                            window.location.assign("qz:launch");
                            qz.websocket
                                .connect({
                                    retries: 3,
                                    delay: 1,
                                })
                                .then(
                                    () => {
                                        frappe.show_alert({
                                            message: __("Connected to QZ Tray!"),
                                            indicator: "green",
                                        });
                                        resolve();
                                    },
                                    () => {
                                        frappe.throw(
                                            __(
                                                'Error connecting to QZ Tray Application...<br><br> You need to have QZ Tray application installed and running, to use the Raw Print feature.<br><br><a target="_blank" href="https://qz.io/download/">Click here to Download and install QZ Tray</a>.<br> <a target="_blank" href="https://erpnext.com/docs/user/manual/en/setting-up/print/raw-printing">Click here to learn more about Raw Printing</a>.'
                                            )
                                        );
                                        reject();
                                    }
                                );
                        } else {
                            frappe.show_alert(
                                {
                                    message: "QZ Tray " + err.toString(),
                                    indicator: "red",
                                },
                                14
                            );
                            reject();
                        }
                    }
                );
            }
        })
    }
    async init_qz() {
        var me = this
        return frappe.db.get_doc('QZ Settings', undefined).then((qz_doc) => {
            if(qz_doc.trusted_certificate != null && qz_doc.trusted_certificate != "" && qz_doc.private_certificate != "" && qz_doc.private_certificate != null){
                frappe.ui.form.qz_init().then(function(){
                    ///// QZ Certificate ///
                    qz.security.setCertificatePromise(function(resolve, reject) {
                        resolve(qz_doc.trusted_certificate);
                    });
                    qz.security.setSignaturePromise(function(toSign) {
                        return function(resolve, reject) {
                            try {
                                var pk = KEYUTIL.getKey(qz_doc.private_certificate);
                                //var sig = new KJUR.crypto.Signature({"alg": "SHA512withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                                var sig = new KJUR.crypto.Signature({"alg": "SHA1withRSA"});  // Use "SHA1withRSA" for QZ Tray 2.0 and older
                                sig.init(pk); 
                                sig.updateString(toSign);
                                var hex = sig.sign();
                                resolve(stob64(hextorstr(hex)));
                            } catch (err) {
                                console.error(err);
                                reject(err);
                            }
                        };
                    });
                    me.qz_connect()
                });
            }
            else {
                frappe.ui.form.qz_init().then(()=>{
                    me.qz_connect()
                })
            }
        });
    }
    async get_pos_hw_profile(pos_profile) {
        var me = this
        if (!me.hw_profile) {
            let profile_name = (await frappe.db.get_value("POS Profile", pos_profile, "custom_hardware_profile")).message?.custom_hardware_profile
            return (await frappe.db.get_value("Hardware Profile", profile_name, "*", (values)=>{
                me.hw_profile = values
            })).message
        }
        return me.hw_profile
    }
    async set_printer() {
        var me = this
        var profile = me.hw_profile
        var printers = await qz.printers.find()
        hwi.has_printer = profile?.has_printer;
        if(hwi.has_printer){
            if (profile.printer_name_for_transactions) {
                if (printers.includes(profile.printer_name_for_transactions)) {
                    hwi.raw_printer = profile.printer_name_for_transactions
                }
            }
        }
        if (!hwi.raw_printer) {
            var d = new frappe.ui.Dialog({
                'fields': [
                    {'fieldname': 'printer', 'fieldtype': 'Select', 'reqd': 1, 'label': "Printer", "options": printers}
                ],
                primary_action: function(){
                    hwi.raw_printer = d.get_values().printer;
                    d.hide();
                },
                secondary_action: function(){
                    d.hide();
                },
                secondary_action_label: "Cancel",
                'title': 'Select printer for Raw Printing'
            });
            d.show();
        }
        hwi.is_cash_drawer_attached = profile?.is_cash_drawer_attached;
    }
    async set_serial_comm(port) {
        if (hwi.serial_port) return
        if (port) {
            let data = await qz.serial.findPorts()
            if (data.includes(port)) {
                await qz.serial.openPort(port).then(
                    ()=> {
                        hwi.serial_port = port
                    }).catch(
                    (err)=>{
                        console.log("Hardware not found: "+err)
                    }
                )
            }
        }
    }
    async send_comm_data(port, line1, line2) {
        if (!hwi.serial_port) await this.set_serial_comm(port)
        if (!hwi.serial_port) return
        qz.serial.sendData(hwi.serial_port, "\f"+line1+"\n\r")
        if (line2) qz.serial.sendData(hwi.serial_port, line2)
    }
    async send_comm_data_for_line_2(port, data) {
        if (!hwi.serial_port) await this.set_serial_comm(port)
        if (!hwi.serial_port) return
        qz.serial.sendData(hwi.serial_port, "\n\r\x18"+data)
    }
}

hwi.qz = new HWIntegration()