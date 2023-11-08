frappe.ui.POSCommandsBuilder = class extends frappe.ui.POSCommandsBuilder{
    async validate_add_pos_item(item_list, redirect_to_profile){
        super.validate_add_pos_item(item_list, redirect_to_profile)
        var profile = await frappe.pos_interface_builder.hw_profile
        console.log(profile)
        console.log(item_list[item_list.length-1])
        if (profile.port) {
            var txn_line1 = await frappe.render_template(profile.txn_line_1, {doc: frappe.pos_interface_builder.doc_obj["POS Invoice"], item: item_list[item_list.length-1]})
            var txn_line2
            if (profile.txn_line_2) {
                console.log(frappe.pos_interface_builder.doc_obj["POS Invoice"])
                txn_line2 = frappe.render_template(profile.txn_line_2, {"doc": frappe.pos_interface_builder.doc_obj["POS Invoice"], "item": item_list[-1]})
            }
            send_comm_data(profile.port, txn_line1, txn_line2)
        }
    }
    async complete_transaction(profile_id, pos_invoice_name){
		super.complete_transaction(profile_id, pos_invoice_name)
        var profile = frappe.pos_interface_builder.hw_profile
        if (profile.port) {
            var txn_line1 = profile.txn_end_line_1
            var txn_line2 = profile.txn_end_line_2
            send_comm_data(profile.port, txn_line1, txn_line2)
        }
	}
    print_receipt(pos_invoice_name, pos_print_format){
		var me = this;
        if (!pos_invoice_name || !pos_print_format) return
		if (window.raw_printer){
			me.get_raw_commands(pos_invoice_name, pos_print_format,function (out) {
                frappe.ui.form
                    .qz_connect()
                    .then(function () {
                        var data ;
                        if (out.raw_printing){
                            data = [out.print_data]
                        }
                        else {
                            data = [{
                                type: 'pixel',
                                format: 'html',
                                flavor: 'plain',
                                data: out.print_data
                            }]
                        }
                        let config = qz.configs.create(window.raw_printer);
                        return qz.print(config, data);
                    })
                    .then(frappe.ui.form.qz_success)
                    .catch((err) => {
                        frappe.ui.form.qz_fail(err);
                    });
            })
		}
        else {
            frappe.utils.print(
				"POS Invoice",
				pos_invoice_name,
				pos_print_format,
				0,
				frappe.boot.lang
			);
        }
	}
    get_raw_commands(pos_invoice, pos_print_format,callback) {
		frappe.call({
			method: "hw_integration.utils.print.get_print_content",
			args: {
				pos_invoice: pos_invoice,
				print_format: pos_print_format
			},
			callback: function (r) {
				if (!r.exc) {
					callback(r.message);
				}
			},
		});
	}

}

frappe.POSInterfaceBuilder = class extends frappe.POSInterfaceBuilder {
    async prepare_app_defaults(data) {
        var me = this
        await super.prepare_app_defaults(data)
        await init_qz()
        if (!frappe.pos_interface_builder.hw_profile) {
            let hw_profile = (await frappe.db.get_value("POS Profile", me.pos_profile, "custom_hardware_profile")).message?.custom_hardware_profile
            await frappe.db.get_value("Hardware Profile", hw_profile, "*", (values)=>{
                frappe.pos_interface_builder.hw_profile = values
            })
        }
        let profile = frappe.pos_interface_builder.hw_profile
        await set_serial_comm(profile)
        await set_printer(profile)
    }
    async load_interface_components(pos_invoice){
        super.load_interface_components(pos_invoice)
        if (!pos_invoice) {
            let profile = frappe.pos_interface_builder.hw_profile
            await send_comm_data(profile.port, profile.wlc_line_1, profile.wlc_line_2)
        }
	}

}

function qz_connect() {
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

async function init_qz() {
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
                qz_connect()
            });
        }
        else {
            frappe.ui.form.qz_init().then(()=>{
                qz_connect()
            })
        }
    });
}

async function set_printer(profile) {
    window.has_printer = profile?.has_printer;
    if(window.has_printer){
        if (profile.printer_name_for_transactions) {
            window.raw_printer = profile.printer_name_for_transactions
        }
    }
    if (!window.raw_printer) {
        var d = new frappe.ui.Dialog({
            'fields': [
                {'fieldname': 'printer', 'fieldtype': 'Select', 'reqd': 1, 'label': "Printer"}
            ],
            primary_action: function(){
                window.raw_printer = d.get_values().printer;
                d.hide();
            },
            secondary_action: function(){
                d.hide();
            },
            secondary_action_label: "Cancel",
            'title': 'Select printer for Raw Printing'
        });
        
    }
    window.is_cash_drawer_attached = profile?.is_cash_drawer_attached;
}

async function set_serial_comm(port) {
    if (window.serial_port) return
    if (port) {
        let data = await qz.serial.findPorts()
        if (data.includes(port)) {
            await qz.serial.openPort(port).then(
                ()=> {
                    window.serial_port = port
                }).catch(
                (err)=>{
                    console.log("Hardware not found: "+err)
                }
            )
        }
    }
}

async function send_comm_data(port, line1, line2) {
    if (!window.serial_port) await set_serial_comm(port)
    qz.serial.sendData(window.serial_port, "\f"+line1+"\n\r")
    if (line2) qz.serial.sendData(window.serial_port, line2)
}